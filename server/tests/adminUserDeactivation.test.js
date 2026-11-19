import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { User } from "../src/models/User.js";
import { createAdminRoutes } from "../src/routes/adminRoutes.js";

const ADMIN_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const PATH = `/api/admin/users/${USER_ID}/deactivate`;

afterEach(() => {
  vi.restoreAllMocks();
});

function query(result) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

function makeApp(role = "ADMIN", userId = ADMIN_ID) {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId,
        role,
        sessionId: "session-id",
      })),
    },
    sessions: {
      findActive: vi.fn(async () => ({})),
      recordRequest: vi.fn(async () => ({})),
    },
  };
  const app = express();
  app.use("/api/admin", createAdminRoutes({ auth }));
  app.use(errorHandler);
  return app;
}

describe("PATCH /api/admin/users/:userId/deactivate", () => {
  it("deactivates the selected eligible account and returns its updated status", async () => {
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue(
      query({ _id: USER_ID, isActive: false }),
    );
    const find = vi.spyOn(User, "findById");
    const endSessions = vi
      .spyOn(RefreshToken, "deleteMany")
      .mockResolvedValue({ deletedCount: 1 });

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: USER_ID, isActive: false });
    const [filter, update, options] = User.findOneAndUpdate.mock.calls[0];
    expect(filter._id).toBe(USER_ID);
    expect(filter.role).toMatchObject({ $in: ["CLIMBER", "GYM_ADMIN"] });
    expect(filter.isActive).toBe(true);
    expect(update).toEqual({ $set: { isActive: false } });
    expect(options).toMatchObject({
      returnDocument: "after",
      runValidators: true,
    });
    expect(find).not.toHaveBeenCalled();
    expect(endSessions).toHaveBeenCalledWith({ user: USER_ID });
  });

  it.each(["GYM_ADMIN", "CLIMBER", "VISITOR"])(
    "rejects a %s user before accessing accounts",
    async (role) => {
      const update = vi.spyOn(User, "findOneAndUpdate");
      const find = vi.spyOn(User, "findById");
      const response = await request(makeApp(role))
        .patch(PATH)
        .set("Authorization", "Bearer header.payload.signature");

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("ROLE_FORBIDDEN");
      expect(update).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
    },
  );

  it("requires authentication", async () => {
    const update = vi.spyOn(User, "findOneAndUpdate");
    const response = await request(makeApp()).patch(PATH);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("NOT_AUTHENTICATED");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a malformed user id before accessing users", async () => {
    const update = vi.spyOn(User, "findOneAndUpdate");
    const response = await request(makeApp())
      .patch("/api/admin/users/not-an-id/deactivate")
      .set("Authorization", "Bearer header.payload.signature");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(update).not.toHaveBeenCalled();
  });

  it("returns not found when the selected account does not exist", async () => {
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue(query(null));
    vi.spyOn(User, "findById").mockReturnValue(query(null));

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("USER_NOT_FOUND");
  });

  it("rejects self-deactivation", async () => {
    const update = vi.spyOn(User, "findOneAndUpdate");
    const response = await request(makeApp("ADMIN", USER_ID))
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("USER_DEACTIVATION_FORBIDDEN");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects deactivation of another ADMIN account", async () => {
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue(query(null));
    vi.spyOn(User, "findById").mockReturnValue(
      query({ role: "ADMIN", isActive: true }),
    );

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("USER_DEACTIVATION_FORBIDDEN");
  });

  it("rejects repeat deactivation of an inactive account with conflict", async () => {
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue(query(null));
    vi.spyOn(User, "findById").mockReturnValue(
      query({ role: "CLIMBER", isActive: false }),
    );

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature");

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("USER_ALREADY_INACTIVE");
  });
});
