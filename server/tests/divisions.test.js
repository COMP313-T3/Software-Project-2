import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { User } from "../src/models/User.js";
import { Registration } from "../src/models/Registration.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

const COMPETITION_ID = "507f1f77bcf86cd799439011";
const OTHER_COMPETITION = "507f1f77bcf86cd799439018";
const GYM_ID = "507f1f77bcf86cd799439012";
const ADMIN_ID = "507f1f77bcf86cd799439001";
const CLIMBER_ID = "507f1f77bcf86cd799439031";
const REGISTRATION_ID = "507f1f77bcf86cd799439041";
const BEGINNER_ID = "507f1f77bcf86cd799439021";
const OPEN_ID = "507f1f77bcf86cd799439022";
const OTHER_DIVISION = "507f1f77bcf86cd799439025";
const objectId = value => new mongoose.Types.ObjectId(value);
const competition = { _id: objectId(COMPETITION_ID), gymId: objectId(GYM_ID) };
const beginner = { _id: objectId(BEGINNER_ID), competitionId: competition._id, name: "Beginner" };
const open = { _id: objectId(OPEN_ID), competitionId: competition._id, name: "Open" };
const registration = {
  _id: objectId(REGISTRATION_ID), competitionId: competition._id, status: "CONFIRMED", registeredAt: new Date("2026-10-12T17:00:00Z"),
  climberId: { _id: objectId(CLIMBER_ID), firstName: "Ada", lastName: "Climber", email: "ada@example.com", address: "private-address", passwordHash: "private-hash" },
  divisionId: beginner,
};
function query(value) {
  const q = { collation: vi.fn(() => q), sort: vi.fn(() => q), populate: vi.fn(() => q), lean: vi.fn(async () => value) };
  return q;
}
function makeApp(role = "GYM_ADMIN") {
  const auth = {
    accessTokens: { verify: vi.fn(async () => ({ userId: ADMIN_ID, role, sessionId: "session-id" })) },
    sessions: { findActive: vi.fn(async () => ({})), recordRequest: vi.fn(async () => ({ expiresIn: 3600, limitReached: false })) },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/gym-admin", createGymAdminRoutes({ auth }));
  app.use(errorHandler);
  return app;
}
const base = "/api/gym-admin/competitions/" + COMPETITION_ID;
const routes = [
  ["get", base + "/divisions", undefined],
  ["post", base + "/divisions", { name: "Youth" }],
  ["get", base + "/climbers", undefined],
  ["put", base + "/climbers/" + CLIMBER_ID + "/division", { divisionId: OPEN_ID }],
];
function call(app, method, path, body, authenticate = true) {
  const test = request(app)[method](path);
  if (authenticate) test.set("Authorization", "Bearer a.b.c");
  return body ? test.send(body) : test;
}
beforeEach(() => {
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(User, "exists").mockResolvedValue({ _id: "account" });
  vi.spyOn(Gym, "find").mockReturnValue(query([{ _id: objectId(GYM_ID), name: "Brian Test Gym", location: "Toronto" }]));
  // Keep the actual competition query casting/sanitization; stub only its database boundary.
  vi.spyOn(Competition.collection, "findOne").mockImplementation(async filter =>
    String(filter._id) === COMPETITION_ID && filter.gymId.$in.some(id => String(id) === GYM_ID) ? competition : null,
  );
  vi.spyOn(Division, "find").mockReturnValue(query([beginner, open]));
  vi.spyOn(Division, "findOne").mockImplementation(filter => query(filter._id ? open : null));
  vi.spyOn(Division, "create").mockResolvedValue(new Division({ _id: objectId(OTHER_DIVISION), competitionId: competition._id, name: "Youth" }));
  vi.spyOn(Registration, "aggregate").mockResolvedValue([{ _id: beginner._id, count: 1 }, { _id: open._id, count: 0 }]);
  vi.spyOn(Registration, "find").mockReturnValue(query([registration]));
  vi.spyOn(Registration, "findOneAndUpdate").mockReturnValue(query({ ...registration, divisionId: open }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("US-014 division/climber API integration", () => {
  it.each(routes)("requires authentication for %s %s", async (method, path, body) => {
    const response = await call(makeApp(), method, path, body, false);
    expect(response.status).toBe(401);
    expect(Gym.find).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "CLIMBER"])("denies %s access to every division/climber operation before reading gyms", async role => {
    for (const [method, path, body] of routes) {
      const response = await call(makeApp(role), method, path, body);
      expect(response.status).toBe(403);
    }
    expect(Gym.find).not.toHaveBeenCalled();
    expect(Division.create).not.toHaveBeenCalled();
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("requires an active assigned gym", async () => {
    vi.mocked(Gym.find).mockReturnValue(query([]));
    const response = await call(makeApp(), "get", base + "/divisions");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("NO_ASSIGNED_GYM");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });
  it("lists only the selected competition's divisions with their registration counts", async () => {
    const response = await call(makeApp(), "get", base + "/divisions");
    expect(response.status).toBe(200);
    expect(response.body.divisions.map(item => [item.name, item.climberCount])).toEqual([["Beginner", 1], ["Open", 0]]);
    expect(Division.find).toHaveBeenCalledWith({ competitionId: competition._id });
    expect(Registration.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: { competitionId: competition._id } }]));
    const filter = vi.mocked(Competition.collection.findOne).mock.calls[0][0];
    expect(String(filter._id)).toBe(COMPETITION_ID);
    expect(filter.gymId.$in.map(String)).toEqual([GYM_ID]);
    expect(filter.gymId.$eq).toBeUndefined();
  });
  it.each(routes)("refuses another competition for %s without touching its divisions/registrations", async (method, path, body) => {
    const response = await call(makeApp(), method, path.replace(COMPETITION_ID, OTHER_COMPETITION), body);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Division.find).not.toHaveBeenCalled();
    expect(Division.create).not.toHaveBeenCalled();
    expect(Registration.find).not.toHaveBeenCalled();
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("creates a trimmed division for the scoped competition, ignoring forged body ownership", async () => {
    const response = await call(makeApp(), "post", base + "/divisions", { name: "  Youth  ", competitionId: OTHER_COMPETITION, createdBy: "forged-admin" });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ competitionId: COMPETITION_ID, name: "Youth", climberCount: 0 });
    expect(Division.create).toHaveBeenCalledWith({ competitionId: competition._id, name: "Youth" });
  });
  it.each(["", "  ", "x".repeat(51)])("rejects invalid division names before saving (%j)", async name => {
    const response = await call(makeApp(), "post", base + "/divisions", { name });
    expect(response.status).toBe(400);
    expect(response.body.fields.name).toBeTypeOf("string");
    expect(Division.create).not.toHaveBeenCalled();
  });
  it("rejects a duplicate name with inline field feedback", async () => {
    vi.mocked(Division.findOne).mockReturnValue(query(beginner));
    const response = await call(makeApp(), "post", base + "/divisions", { name: "beginner" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("DIVISION_EXISTS");
    expect(response.body.fields.name).toBeTypeOf("string");
    expect(Division.create).not.toHaveBeenCalled();
  });
  it("turns a concurrent unique-index rejection into the same readable duplicate response", async () => {
    vi.mocked(Division.create).mockRejectedValue(Object.assign(new Error("index collision"), { code: 11000 }));
    const response = await call(makeApp(), "post", base + "/divisions", { name: "Youth" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("DIVISION_EXISTS");
  });
  it("lists registration identity, status and division without private profile fields", async () => {
    const response = await call(makeApp(), "get", base + "/climbers");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1, climbers: [{
      registrationId: REGISTRATION_ID, status: "CONFIRMED", climber: { _id: CLIMBER_ID, firstName: "Ada", lastName: "Climber", email: "ada@example.com" },
      division: { _id: BEGINNER_ID, name: "Beginner" },
    }] });
    expect(JSON.stringify(response.body)).not.toMatch(/private-address|private-hash|passwordHash/);
    expect(Registration.find).toHaveBeenCalledWith({ competitionId: competition._id }, "climberId divisionId status registeredAt");
  });
  it("passes only the selected competition and validated division filter to the registration query", async () => {
    vi.mocked(Registration.find).mockReturnValue(query([]));
    const response = await call(makeApp(), "get", base + "/climbers?divisionId=" + OPEN_ID);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ climbers: [], total: 0 });
    expect(Registration.find).toHaveBeenCalledWith({ competitionId: competition._id, divisionId: OPEN_ID }, "climberId divisionId status registeredAt");
  });
  it("presents deleted accounts and divisions as null without crashing", async () => {
    vi.mocked(Registration.find).mockReturnValue(query([{ ...registration, climberId: null, divisionId: null }]));
    const response = await call(makeApp(), "get", base + "/climbers");
    expect(response.status).toBe(200);
    expect(response.body.climbers[0]).toMatchObject({ climber: null, division: null });
  });
  it("moves a climber through one atomic write limited to this competition and returns the confirmed assignment", async () => {
    const response = await call(makeApp(), "put", base + "/climbers/" + CLIMBER_ID + "/division", { divisionId: OPEN_ID, competitionId: OTHER_COMPETITION, status: "WAITLIST" });
    expect(response.status).toBe(200);
    expect(response.body.division).toEqual({ _id: OPEN_ID, name: "Open" });
    expect(response.body.status).toBe("CONFIRMED");
    expect(Division.findOne).toHaveBeenCalledWith({ _id: OPEN_ID, competitionId: competition._id }, "name");
    expect(Registration.findOneAndUpdate).toHaveBeenCalledWith(
      { competitionId: competition._id, climberId: CLIMBER_ID },
      { $set: { divisionId: open._id } },
      { returnDocument: "after", runValidators: true },
    );
  });
  it("refuses an unavailable or foreign-competition division before changing a registration", async () => {
    vi.mocked(Division.findOne).mockReturnValue(query(null));
    const response = await call(makeApp(), "put", base + "/climbers/" + CLIMBER_ID + "/division", { divisionId: OTHER_DIVISION });
    expect(response.status).toBe(400);
    expect(response.body.fields.divisionId).toBe("Choose a division from this competition.");
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("rejects a climber without a registration in this competition", async () => {
    vi.mocked(Registration.findOneAndUpdate).mockReturnValue(query(null));
    const response = await call(makeApp(), "put", base + "/climbers/" + CLIMBER_ID + "/division", { divisionId: OPEN_ID });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("REGISTRATION_NOT_FOUND");
  });
  it("rejects malformed division IDs before a write", async () => {
    const response = await call(makeApp(), "put", base + "/climbers/" + CLIMBER_ID + "/division", { divisionId: "not-an-id" });
    expect(response.status).toBe(400);
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("returns a generic error after an unexpected write failure", async () => {
    vi.mocked(Division.create).mockRejectedValue(new Error("private database credentials"));
    const response = await call(makeApp(), "post", base + "/divisions", { name: "Youth" });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private database credentials");
  });
});
