import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { AppError } from "../src/utils/AppError.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

const EVENT = "507f1f77bcf86cd799439011", CLIMBER = "507f1f77bcf86cd799439012", DIVISION = "507f1f77bcf86cd799439013", GYM = "507f1f77bcf86cd799439014", RECORD = "507f1f77bcf86cd799439015";
const path = `/api/competitions/${EVENT}/registrations`;
const session = { fixture: "transaction-session" };
const event = { _id: EVENT, gymId: GYM, date: new Date("2100-11-01T00:00:00Z"), status: "PUBLISHED", registrationStatus: "OPEN", capacity: 2 };
function query(value) { const q = { session: vi.fn(() => q), lean: vi.fn(async () => value) }; return q; }
function app(role = "CLIMBER", expired = false) {
  const auth = { accessTokens: { verify: vi.fn(async () => { if (expired) throw new AppError(401, "TOKEN_EXPIRED", "Log in again."); return { userId: CLIMBER, role, sessionId: "session" }; }) }, sessions: { findActive: vi.fn(async () => ({})), recordRequest: vi.fn(async () => ({})) } };
  const api = express(); api.use(express.json()); api.use("/api/competitions", createCompetitionRoutes({ auth })); api.use(errorHandler); return api;
}
function post(body = { divisionId: DIVISION }, { role = "CLIMBER", authenticated = true, url = path, expired = false } = {}) {
  const r = request(app(role, expired)).post(url); if (authenticated) r.set("Authorization", "Bearer a.b.c"); return r.send(body);
}
beforeEach(() => {
  vi.spyOn(logger, "info").mockImplementation(() => {}); vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async work => work(session));
  vi.spyOn(Competition, "findOneAndUpdate").mockReturnValue(query(event));
  vi.spyOn(Gym, "findOne").mockReturnValue(query({ _id: GYM }));
  vi.spyOn(Division, "findOne").mockReturnValue(query({ _id: DIVISION }));
  vi.spyOn(Registration, "findOne").mockReturnValue(query(null));
  vi.spyOn(Registration, "countDocuments").mockReturnValue({ session: vi.fn(async () => 1) });
  vi.spyOn(Registration, "create").mockImplementation(async ([body]) => [{ ...body, _id: RECORD }]);
});
afterEach(() => vi.restoreAllMocks());

describe("US028 event registration API", () => {
  it("requires a valid authenticated Climber before reading or writing data", async () => {
    expect((await post(undefined, { authenticated: false })).status).toBe(401);
    expect((await post(undefined, { expired: true })).status).toBe(401);
    for (const role of ["ADMIN", "GYM_ADMIN"]) expect((await post(undefined, { role })).status).toBe(403);
    expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
  it("confirms the token's Climber and returns the documented registration DTO after commit", async () => {
    const r = await post({ divisionId: DIVISION, status: "WAITLIST", registeredAt: "2000-01-01", competitionId: "forged" });
    expect(r.status).toBe(201); expect(r.body).toEqual({ registrationId: RECORD, status: "CONFIRMED", competitionId: EVENT, divisionId: DIVISION });
    expect(Registration.create).toHaveBeenCalledWith([{ competitionId: EVENT, climberId: CLIMBER, divisionId: DIVISION, status: "CONFIRMED", registeredAt: expect.any(Date) }], { session });
    expect(Registration.countDocuments).toHaveBeenCalledWith({ competitionId: EVENT, status: "CONFIRMED" });
    expect(logger.info).toHaveBeenCalledOnce();
  });
  it("accepts the contract-compatible self identity but rejects someone else's identity", async () => {
    expect((await post({ divisionId: DIVISION, climberId: CLIMBER })).status).toBe(201);
    vi.mocked(mongoose.connection.transaction).mockClear();
    const r = await post({ divisionId: DIVISION, climberId: RECORD }); expect(r.status).toBe(400);
    expect(r.body.fields.climberId).toContain("own"); expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
  it.each([{}, { divisionId: "bad" }, { divisionId: { $ne: null } }, { divisionId: DIVISION, climberId: "bad" }])("rejects malformed input before starting a transaction: %j", async body => {
    expect((await post(body)).status).toBe(400); expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
  it("rejects an invalid competition ID before starting a transaction", async () => {
    expect((await post(undefined, { url: path.replace(EVENT, "invalid") })).status).toBe(400);
    expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
  it("uses a real competition write before counting seats, inside a snapshot transaction", async () => {
    await post();
    expect(Competition.findOneAndUpdate).toHaveBeenCalledWith({ _id: EVENT, status: "PUBLISHED" }, { $inc: { registrationVersion: 1 } }, { session, returnDocument: "after", timestamps: false });
    expect(mongoose.connection.transaction).toHaveBeenCalledWith(expect.any(Function), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    expect(Competition.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(Registration.countDocuments.mock.invocationCallOrder[0]);
    expect(Registration.countDocuments.mock.results[0].value.session).toHaveBeenCalledWith(session);
  });
  it.each(["missing or unpublished event", "inactive gym"])("hides %s with the same not-found response", async reason => {
    vi.mocked(reason === "inactive gym" ? Gym.findOne : Competition.findOneAndUpdate).mockReturnValue(query(null));
    const r = await post(); expect(r.status).toBe(404); expect(r.body.error).toBe("COMPETITION_NOT_FOUND"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it.each(["CONFIRMED", "PENDING", "WAITLIST"])("rejects an existing %s registration without creating a second record", async status => {
    vi.mocked(Registration.findOne).mockReturnValue(query({ _id: RECORD, status }));
    const r = await post(); expect(r.status).toBe(409); expect(r.body.error).toBe("ALREADY_REGISTERED"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it("rejects closed registration", async () => {
    vi.mocked(Competition.findOneAndUpdate).mockReturnValue(query({ ...event, registrationStatus: "CLOSED" }));
    const r = await post(); expect(r.status).toBe(409); expect(r.body.error).toBe("REGISTRATION_CLOSED"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it("rejects a past competition even if its saved registration state is OPEN", async () => {
    vi.mocked(Competition.findOneAndUpdate).mockReturnValue(query({ ...event, date: new Date("2000-01-01T00:00:00Z") }));
    const r = await post(); expect(r.status).toBe(409); expect(r.body.error).toBe("COMPETITION_FINISHED"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it("rejects missing and foreign divisions identically and scopes the check to the event", async () => {
    vi.mocked(Division.findOne).mockReturnValue(query(null)); const r = await post();
    expect(r.status).toBe(400); expect(r.body.fields.divisionId).toBe("Choose a division from this competition.");
    expect(Division.findOne).toHaveBeenCalledWith({ _id: DIVISION, competitionId: EVENT }, "_id"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it.each([2, 3])("rejects when confirmed count %s meets or exceeds capacity", async count => {
    vi.mocked(Registration.countDocuments).mockReturnValue({ session: vi.fn(async () => count) });
    const r = await post(); expect(r.status).toBe(409); expect(r.body.error).toBe("COMPETITION_FULL"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it("maps the unique-index duplicate error to a clear conflict", async () => {
    vi.mocked(Registration.create).mockRejectedValue({ code: 11000 });
    const r = await post(); expect(r.status).toBe(409); expect(r.body.error).toBe("ALREADY_REGISTERED"); expect(logger.info).not.toHaveBeenCalled();
  });
  it("does not fall back to unsafe writes on standalone MongoDB", async () => {
    vi.mocked(mongoose.connection.transaction).mockRejectedValue({ code: 20, message: "Transaction numbers are only allowed on a replica set member" });
    const r = await post(); expect(r.status).toBe(503); expect(r.body.error).toBe("REGISTRATION_UNAVAILABLE"); expect(Registration.create).not.toHaveBeenCalled();
  });
  it("does not announce success when a write or commit fails or expose internal details", async () => {
    vi.mocked(mongoose.connection.transaction).mockRejectedValue(new Error("private database connection details"));
    const r = await post(); expect(r.status).toBe(500); expect(JSON.stringify(r.body)).not.toContain("private"); expect(logger.info).not.toHaveBeenCalled();
  });
});
