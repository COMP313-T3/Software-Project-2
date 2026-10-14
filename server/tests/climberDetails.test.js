import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

const COMPETITION = "507f1f77bcf86cd799439011";
const OTHER_EVENT = "507f1f77bcf86cd799439019";
const GYM = "507f1f77bcf86cd799439012";
const CLIMBER = "507f1f77bcf86cd799439031";
const DIVISION = "507f1f77bcf86cd799439021";
const NEW_DIVISION = "507f1f77bcf86cd799439022";
const ADMIN = "507f1f77bcf86cd799439001";
const oid = value => new mongoose.Types.ObjectId(value);
const competition = { _id: oid(COMPETITION), gymId: oid(GYM) };
const registration = {
  _id: oid("507f1f77bcf86cd799439041"), competitionId: competition._id,
  status: "CONFIRMED", registeredAt: new Date("2026-10-13T12:00:00Z"),
  climberId: { _id: oid(CLIMBER), firstName: "Ada", lastName: "Climber", email: "ada@example.com", passwordHash: "private-hash", address: "private-address", phone: "private-phone" },
  divisionId: { _id: oid(DIVISION), name: "Beginner" },
};
function query(value) {
  const q = { sort: vi.fn(() => q), populate: vi.fn(() => q), lean: vi.fn(async () => value) };
  return q;
}
function app(role = "GYM_ADMIN") {
  const auth = {
    accessTokens: { verify: vi.fn(async () => ({ userId: ADMIN, role, sessionId: "session" })) },
    sessions: { findActive: vi.fn(async () => ({})), recordRequest: vi.fn(async () => ({})) },
  };
  const api = express(); api.use(express.json());
  api.use("/api/gym-admin", createGymAdminRoutes({ auth })); api.use(errorHandler);
  return api;
}
const path = `/api/gym-admin/competitions/${COMPETITION}/climbers/${CLIMBER}`;
const routes = [["get", undefined], ["patch", { divisionId: NEW_DIVISION }], ["delete", undefined]];
function call(method, body, { role = "GYM_ADMIN", url = path, authenticated = true } = {}) {
  const test = request(app(role))[method](url);
  if (authenticated) test.set("Authorization", "Bearer a.b.c");
  return body === undefined ? test : test.send(body);
}
beforeEach(() => {
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(Gym, "find").mockReturnValue(query([{ _id: oid(GYM), name: "Local Gym" }]));
  vi.spyOn(Competition.collection, "findOne").mockImplementation(async filter =>
    String(filter._id) === COMPETITION && filter.gymId.$in.some(id => String(id) === GYM) ? competition : null,
  );
  vi.spyOn(Registration, "findOne").mockReturnValue(query(registration));
  vi.spyOn(Division, "findOne").mockReturnValue(query({ _id: oid(NEW_DIVISION), name: "Open" }));
  vi.spyOn(Registration, "findOneAndUpdate").mockReturnValue(query({ ...registration, divisionId: { _id: oid(NEW_DIVISION), name: "Open" } }));
  vi.spyOn(Registration, "findOneAndDelete").mockReturnValue(query(registration));
});
afterEach(() => vi.restoreAllMocks());

describe("US-015 #67 Climber details, update and removal API", () => {
  it.each(routes)("requires authentication for %s", async (method, body) => {
    expect((await call(method, body, { authenticated: false })).status).toBe(401);
    expect(Gym.find).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "CLIMBER"])("rejects the %s role for every operation", async role => {
    for (const [method, body] of routes) expect((await call(method, body, { role })).status).toBe(403);
    expect(Gym.find).not.toHaveBeenCalled();
  });
  it.each(routes)("rejects revoked or inactive gym access for %s", async (method, body) => {
    vi.mocked(Gym.find).mockReturnValue(query([]));
    const r = await call(method, body);
    expect(r.status).toBe(403); expect(r.body.error).toBe("NO_ASSIGNED_GYM");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });
  it.each(routes)("hides another gym's competition for %s without touching registrations", async (method, body) => {
    const r = await call(method, body, { url: path.replace(COMPETITION, OTHER_EVENT) });
    expect(r.status).toBe(404); expect(r.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Registration.findOne).not.toHaveBeenCalled();
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Registration.findOneAndDelete).not.toHaveBeenCalled();
  });
  it.each(routes)("validates both route IDs before any database mutation for %s", async (method, body) => {
    for (const id of [COMPETITION, CLIMBER]) {
      expect((await call(method, body, { url: path.replace(id, "invalid") })).status).toBe(400);
    }
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Registration.findOneAndDelete).not.toHaveBeenCalled();
  });
  it.each(["CONFIRMED", "PENDING", "WAITLIST"])("returns %s registration details without private account data", async status => {
    const q = query({ ...registration, status }); vi.mocked(Registration.findOne).mockReturnValue(q);
    const r = await call("get");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ registrationId: String(registration._id), status, climber: { _id: CLIMBER, firstName: "Ada" }, division: { _id: DIVISION, name: "Beginner" } });
    expect(JSON.stringify(r.body)).not.toMatch(/private-|passwordHash|phone|address/);
    expect(Registration.findOne).toHaveBeenCalledWith({ competitionId: competition._id, climberId: CLIMBER }, "climberId divisionId status registeredAt");
    expect(q.populate).toHaveBeenCalledWith("climberId", "firstName lastName email");
  });
  it("returns null for missing account/division references without disclosing extra data", async () => {
    vi.mocked(Registration.findOne).mockReturnValue(query({ ...registration, climberId: null, divisionId: null }));
    const r = await call("get"); expect(r.status).toBe(200); expect(r.body).toMatchObject({ climber: null, division: null });
  });
  it("returns 404 when the Climber has no registration in this competition", async () => {
    vi.mocked(Registration.findOne).mockReturnValue(query(null));
    const r = await call("get"); expect(r.status).toBe(404); expect(r.body.error).toBe("REGISTRATION_NOT_FOUND");
  });
  it("updates only the selected registration's division and ignores forged ownership/account fields", async () => {
    const r = await call("patch", { divisionId: NEW_DIVISION, competitionId: OTHER_EVENT, climberId: ADMIN, status: "WAITLIST", email: "forged@example.com", firstName: "Forged" });
    expect(r.status).toBe(200); expect(r.body.division._id).toBe(NEW_DIVISION); expect(r.body.status).toBe("CONFIRMED");
    expect(Division.findOne).toHaveBeenCalledWith({ _id: NEW_DIVISION, competitionId: competition._id }, "name");
    expect(Registration.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      { competitionId: competition._id, climberId: CLIMBER },
      { $set: { divisionId: oid(NEW_DIVISION) } }, { returnDocument: "after", runValidators: true },
    );
    expect(Registration.findOneAndDelete).not.toHaveBeenCalled();
  });
  it.each([{}, { status: "CONFIRMED" }, { divisionId: "bad" }, { divisionId: null }, { divisionId: [] }, { divisionId: { $ne: null } }])("rejects invalid or unsupported updates %j", async body => {
    const r = await call("patch", body); expect(r.status).toBe(400);
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("rejects a missing or another competition's division before updating", async () => {
    vi.mocked(Division.findOne).mockReturnValue(query(null));
    const r = await call("patch", { divisionId: NEW_DIVISION });
    expect(r.status).toBe(400); expect(r.body.fields.divisionId).toBeTypeOf("string");
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("does not create a registration when updating an unregistered Climber", async () => {
    vi.mocked(Registration.findOneAndUpdate).mockReturnValue(query(null));
    const r = await call("patch", { divisionId: NEW_DIVISION }); expect(r.status).toBe(404); expect(r.body.error).toBe("REGISTRATION_NOT_FOUND");
  });
  it("removes exactly one selected event registration atomically and returns an empty 204", async () => {
    const r = await call("delete", { competitionId: OTHER_EVENT, climberId: ADMIN });
    expect(r.status).toBe(204); expect(r.text).toBe("");
    expect(Registration.findOneAndDelete).toHaveBeenCalledExactlyOnceWith({ competitionId: competition._id, climberId: CLIMBER });
    expect(Registration.findOneAndUpdate).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("Climber registration removed", { registrationId: String(registration._id), competitionId: COMPETITION, userId: ADMIN });
  });
  it("returns 404 for a missing or already removed registration", async () => {
    vi.mocked(Registration.findOneAndDelete).mockReturnValue(query(null));
    const r = await call("delete"); expect(r.status).toBe(404); expect(r.body.error).toBe("REGISTRATION_NOT_FOUND");
  });
  it.each(["patch", "delete"])("does not report success or leak a technical error when %s fails", async method => {
    const q = query(null); q.lean.mockRejectedValue(new Error("private database credential"));
    if (method === "patch") vi.mocked(Registration.findOneAndUpdate).mockReturnValue(q);
    else vi.mocked(Registration.findOneAndDelete).mockReturnValue(q);
    const r = await call(method, method === "patch" ? { divisionId: NEW_DIVISION } : undefined);
    expect(r.status).toBe(500); expect(JSON.stringify(r.body)).not.toContain("private database credential");
  });
});
