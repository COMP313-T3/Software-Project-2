import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Gym } from "../src/models/Gym.js";
import { GymAdminRequest } from "../src/models/GymAdminRequest.js";
import { User } from "../src/models/User.js";
import { createAdminRoutes } from "../src/routes/adminRoutes.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeApp(role = "ADMIN") {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "user-id",
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

describe("GET /api/admin/dashboard", () => {
  it("returns gym, user, and pending request counts to an admin", async () => {
    vi.spyOn(Gym, "countDocuments")
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    vi.spyOn(User, "countDocuments")
      .mockResolvedValueOnce(250)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(230);
    vi.spyOn(GymAdminRequest, "countDocuments")
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const response = await request(makeApp())
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer a.b.c");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gyms: { total: 12, active: 9, pending: 2, inactive: 1 },
      users: { total: 250, admins: 2, gymAdmins: 18, climbers: 230 },
      pendingRequests: { total: 3, newGyms: 1, existingGyms: 2 },
    });
  });

  it("denies authenticated users without the ADMIN role", async () => {
    vi.spyOn(Gym, "countDocuments").mockResolvedValue(0);
    vi.spyOn(User, "countDocuments").mockResolvedValue(0);
    vi.spyOn(GymAdminRequest, "countDocuments").mockResolvedValue(0);

    const response = await request(makeApp("GYM_ADMIN"))
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer a.b.c");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_FORBIDDEN");
    expect(Gym.countDocuments).not.toHaveBeenCalled();
    expect(User.countDocuments).not.toHaveBeenCalled();
    expect(GymAdminRequest.countDocuments).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const response = await request(makeApp()).get("/api/admin/dashboard");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("NOT_AUTHENTICATED");
  });
});
