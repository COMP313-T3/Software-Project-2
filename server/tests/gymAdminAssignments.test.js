import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Gym } from "../src/models/Gym.js";
import { User } from "../src/models/User.js";
import { GymAdminRequest } from "../src/models/GymAdminRequest.js";
import { createGymRoutes } from "../src/routes/gymRoutes.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";
const AUTH = "Bearer a.b.c";

function app(role = "ADMIN") {
  const auth = {
    accessTokens: { verify: vi.fn(async () => ({ userId: USER_ID, role, sessionId: "session" })) },
    sessions: { findActive: vi.fn(async () => ({})), recordRequest: vi.fn(async () => ({})) },
  };
  const api = express();
  api.use(express.json());
  api.use("/api/gyms", createGymRoutes(auth));
  api.use(errorHandler);
  return api;
}
function query(result) {
  const stub = { select: vi.fn(() => stub), populate: vi.fn(() => stub), lean: vi.fn(async () => result) };
  return stub;
}
let update;
beforeEach(() => {
  vi.spyOn(Gym, "exists").mockResolvedValue({ _id: GYM_ID });
  vi.spyOn(User, "findById").mockReturnValue(query({ role: "GYM_ADMIN", isActive: true }));
  vi.spyOn(GymAdminRequest, "exists").mockResolvedValue({ _id: USER_ID });
  update = vi.spyOn(Gym, "findByIdAndUpdate").mockReturnValue(query({ _id: GYM_ID, adminIds: [{ _id: USER_ID }] }));
});
afterEach(() => vi.restoreAllMocks());

describe("US-006 #6.1 assignment API", () => {
  it("assigns an active administrator approved for exactly this gym with an atomic update", async () => {
    const response = await request(app()).put(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(200);
    expect(GymAdminRequest.exists).toHaveBeenCalledWith({ userId: USER_ID, gymId: GYM_ID, status: "APPROVED" });
    expect(update).toHaveBeenCalledWith(GYM_ID,
      { $addToSet: { adminIds: new mongoose.Types.ObjectId(USER_ID) } },
      { returnDocument: "after", runValidators: true });
    expect(response.body.adminIds[0]._id).toBe(USER_ID);
  });
  it("rejects a missing gym before looking up the account", async () => {
    vi.mocked(Gym.exists).mockResolvedValue(null);
    const response = await request(app()).put(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("GYM_NOT_FOUND");
    expect(User.findById).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects a missing account", async () => {
    vi.mocked(User.findById).mockReturnValue(query(null));
    const response = await request(app()).put(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("USER_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });
  it.each([
    { role: "CLIMBER", isActive: true },
    { role: "ADMIN", isActive: true },
    { role: "GYM_ADMIN", isActive: false },
  ])("rejects an ineligible account %j without changing its role", async user => {
    vi.mocked(User.findById).mockReturnValue(query(user));
    const response = await request(app()).put(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("GYM_ADMIN_REQUIRED");
    expect(GymAdminRequest.exists).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects pending, rejected, absent or other-gym approval", async () => {
    vi.mocked(GymAdminRequest.exists).mockResolvedValue(null);
    const response = await request(app()).put(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("GYM_ADMIN_NOT_APPROVED");
    expect(update).not.toHaveBeenCalled();
  });
  it("handles the selected gym disappearing before the update", async () => {
    update.mockReturnValue(query(null));
    const response = await request(app()).put(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("GYM_NOT_FOUND");
  });
});

describe("US-006 #6.2 removal API", () => {
  it("pulls only the selected gym/user relationship without changing account or approval", async () => {
    const response = await request(app()).delete(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(GYM_ID,
      { $pull: { adminIds: new mongoose.Types.ObjectId(USER_ID) } },
      { returnDocument: "after", runValidators: true });
    expect(User.findById).not.toHaveBeenCalled();
    expect(GymAdminRequest.exists).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing selected gym", async () => {
    update.mockReturnValue(query(null));
    const response = await request(app()).delete(`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(404);
  });
});

describe.each(["put", "delete"])("%s assignment endpoint authorization and validation", method => {
  it("denies unauthenticated access before database queries", async () => {
    const response = await request(app())[method](`/api/gyms/${GYM_ID}/admins/${USER_ID}`);
    expect(response.status).toBe(401);
    expect(Gym.exists).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each(["CLIMBER", "GYM_ADMIN"])("denies %s before database queries", async role => {
    const response = await request(app(role))[method](`/api/gyms/${GYM_ID}/admins/${USER_ID}`).set("Authorization", AUTH);
    expect(response.status).toBe(403);
    expect(Gym.exists).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each([["invalid", USER_ID], [GYM_ID, "invalid"]])("rejects malformed IDs %s/%s", async (gymId, userId) => {
    const response = await request(app())[method](`/api/gyms/${gymId}/admins/${userId}`).set("Authorization", AUTH);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(Gym.exists).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
