import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { User } from "../src/models/User.js";
import { createAdminRoutes } from "../src/routes/adminRoutes.js";

const ADMIN_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const PATH = `/api/admin/users/${USER_ID}`;

afterEach(() => {
  vi.restoreAllMocks();
});

function query(result) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

function makeApp(role = "ADMIN") {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: ADMIN_ID,
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
  app.use(express.json());
  app.use("/api/admin", createAdminRoutes({ auth }));
  app.use(errorHandler);
  return app;
}

describe("PATCH /api/admin/users/:userId", () => {
  it("updates only the selected account's allowed profile fields", async () => {
    vi.spyOn(User, "findById").mockReturnValue(
      query({ country: "CA", postalCode: "M5V 2T6" }),
    );
    const updatedUser = {
      _id: USER_ID,
      firstName: "Jordan",
      lastName: "Sendwell",
      email: "jordan@example.com",
      role: "CLIMBER",
      isActive: true,
      postalCode: "M5V 2T6",
      country: "CA",
      location: { type: "Point", coordinates: [-79.39, 43.64] },
    };
    const update = vi
      .spyOn(User, "findByIdAndUpdate")
      .mockReturnValue(query(updatedUser));

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature")
      .send({
        firstName: " Jordan ",
        location: { lat: 43.64, lng: -79.39 },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedUser);
    expect(User.findById).toHaveBeenCalledWith(USER_ID, "country postalCode");
    const [targetId, updateDoc, options] = update.mock.calls[0];
    expect(targetId).toBe(USER_ID);
    expect(updateDoc).toEqual({
      $set: {
        firstName: "Jordan",
        location: { type: "Point", coordinates: [-79.39, 43.64] },
      },
    });
    expect(options).toMatchObject({
      returnDocument: "after",
      runValidators: true,
    });
    expect(update.mock.results[0].value.select).toHaveBeenCalledWith(
      "firstName lastName email role isActive dateOfBirth gender phone address postalCode country location createdAt updatedAt",
    );
  });

  it("rejects role and permission changes instead of silently ignoring them", async () => {
    const find = vi.spyOn(User, "findById");
    const update = vi.spyOn(User, "findByIdAndUpdate");

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature")
      .send({ role: "GYM_ADMIN", firstName: "Jordan" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(find).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["GYM_ADMIN", "CLIMBER", "VISITOR"])(
    "denies a %s user before reading the selected account",
    async (role) => {
      const find = vi.spyOn(User, "findById");

      const response = await request(makeApp(role))
        .patch(PATH)
        .set("Authorization", "Bearer header.payload.signature")
        .send({ firstName: "Jordan" });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("ROLE_FORBIDDEN");
      expect(find).not.toHaveBeenCalled();
    },
  );

  it("requires authentication", async () => {
    const find = vi.spyOn(User, "findById");

    const response = await request(makeApp()).patch(PATH).send({
      firstName: "Jordan",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("NOT_AUTHENTICATED");
    expect(find).not.toHaveBeenCalled();
  });

  it("rejects malformed user IDs before database access", async () => {
    const find = vi.spyOn(User, "findById");

    const response = await request(makeApp())
      .patch("/api/admin/users/not-an-id")
      .set("Authorization", "Bearer header.payload.signature")
      .send({ firstName: "Jordan" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    [{ firstName: "   " }, "firstName"],
    [{ email: "not-an-email" }, "email"],
    [{ phone: "letters only" }, "phone"],
    [{ gender: "OTHER" }, "gender"],
    [{ dateOfBirth: "2026-02-30" }, "dateOfBirth"],
    [{ location: { lat: 91, lng: -79 } }, "location"],
    [{}, undefined],
  ])("rejects invalid update data %#", async (body, field) => {
    const find = vi.spyOn(User, "findById");
    const update = vi.spyOn(User, "findByIdAndUpdate");

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature")
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    if (field) expect(response.body.fields[field]).toBeDefined();
    expect(find).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a postal code that does not match the account country", async () => {
    vi.spyOn(User, "findById").mockReturnValue(
      query({ country: "CA", postalCode: "M5V 2T6" }),
    );
    const update = vi.spyOn(User, "findByIdAndUpdate");

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature")
      .send({ postalCode: "bad" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields.postalCode).toBeDefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns not found when the selected account does not exist", async () => {
    vi.spyOn(User, "findById").mockReturnValue(query(null));
    const update = vi.spyOn(User, "findByIdAndUpdate");

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature")
      .send({ firstName: "Jordan" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("USER_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an email already used by another account", async () => {
    vi.spyOn(User, "findById").mockReturnValue(
      query({ country: "CA", postalCode: "M5V 2T6" }),
    );
    vi.spyOn(User, "findByIdAndUpdate").mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue({ code: 11000 }),
    });

    const response = await request(makeApp())
      .patch(PATH)
      .set("Authorization", "Bearer header.payload.signature")
      .send({ email: "taken@example.com" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("EMAIL_TAKEN");
    expect(response.body.fields.email).toBeDefined();
  });
});
