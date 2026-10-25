import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { Competition } from "../src/models/Competition.js";
import { Registration } from "../src/models/Registration.js";
import { logger } from "../src/utils/logger.js";
import { parseCalendarDate, torontoToday } from "../src/utils/calendarDates.js";
import { createEventRegistrationFixture } from "./fixtures/eventRegistrationFixture.js";
import "../src/config/database.js";

const uri = process.env.REGISTRATION_TEST_MONGODB_URI;
// Opt-in: normal unit-test runs neither start MongoDB nor contact anyone's .env database.
describe.skipIf(!uri)("US028 real MongoDB registration transactions", () => {
  const database = "topsend_us028_test_" + randomUUID().replaceAll("-", "");
  let api, fixture; const tokens = [];
  beforeAll(async () => {
    const target = new URL(uri);
    if (target.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("Registration integration tests require an explicit loopback MongoDB URI.");
    target.pathname = "/" + database;
    await mongoose.connect(target.href, { serverSelectionTimeoutMS: 10000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName) throw new Error("Use a dedicated local MongoDB replica set for transaction tests.");
    vi.spyOn(logger, "info").mockImplementation(() => {}); vi.spyOn(logger, "error").mockImplementation(() => {});
    fixture = await createEventRegistrationFixture();
    api = createApp({ clientOrigins: [], authSecret: randomUUID(), mailer: null });
    for (const user of fixture.users) {
      const agent = request.agent(api), csrf = await agent.get("/api/auth/csrf");
      const response = await agent.post("/api/auth/login").set("X-CSRF-Token", csrf.body.csrfToken).send({ email: user.email, password: fixture.password });
      expect(response.status, JSON.stringify(response.body)).toBe(200); tokens.push(response.body.token);
    }
  }, 30000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && database.startsWith("topsend_us028_test_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const endpoint = event => `/api/competitions/${event.competition._id}/registrations`;
  const post = (event, user = 0, body = { divisionId: String(event.division._id) }) => request(api).post(endpoint(event)).set("Authorization", "Bearer " + tokens[user]).send(body);
  const count = event => Registration.countDocuments({ competitionId: event.competition._id, status: "CONFIRMED" });

  it("saves a confirmed record and makes it visible in fresh event details", async () => {
    const event = await fixture.makeEvent(); const r = await post(event);
    expect(r.status).toBe(201); const saved = await Registration.findById(r.body.registrationId).lean();
    expect(String(saved.climberId)).toBe(String(fixture.users[0]._id)); expect(saved.status).toBe("CONFIRMED");
    const details = await request(api).get(`/api/competitions/${event.competition._id}`).set("Authorization", "Bearer " + tokens[0]);
    expect(details.body.spacesLeft).toBe(2); expect(details.body.myRegistration.status).toBe("CONFIRMED");
  });
  it("allows exactly one of 12 simultaneous requests for the last seat", async () => {
    const event = await fixture.makeEvent({ capacity: 1 });
    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => post(event, i)));
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    expect(responses.filter(r => r.status === 409 && r.body.error === "COMPETITION_FULL")).toHaveLength(11);
    expect(await count(event)).toBe(1);
  }, 30000);
  it("initializes the guard on an older competition without requiring a backfill", async () => {
    const event = await fixture.makeEvent();
    await Competition.collection.updateOne({ _id: event.competition._id }, { $unset: { registrationVersion: 1 } });
    expect((await post(event)).status).toBe(201);
    expect((await Competition.findById(event.competition._id).lean()).registrationVersion).toBe(1);
  });
  it("accepts a competition taking place today in the documented Toronto calendar", async () => {
    const event = await fixture.makeEvent({ date: parseCalendarDate(torontoToday()).date });
    expect((await post(event)).status).toBe(201);
  });
  it("rejects 11 concurrent duplicates of the same Climber, with only one committed record", async () => {
    const event = await fixture.makeEvent({ capacity: 20 });
    const responses = await Promise.all(Array.from({ length: 12 }, () => post(event)));
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    expect(responses.filter(r => r.status === 409 && r.body.error === "ALREADY_REGISTERED")).toHaveLength(11);
    expect(await Registration.countDocuments({ competitionId: event.competition._id })).toBe(1);
  }, 30000);
  it("counts CONFIRMED registrations only, without upgrading existing waitlist records", async () => {
    const event = await fixture.makeEvent({ capacity: 1 });
    await Registration.create({ competitionId: event.competition._id, divisionId: event.division._id, climberId: fixture.users[1]._id, status: "WAITLIST" });
    expect((await post(event)).status).toBe(201); expect((await post(event, 1)).body.error).toBe("ALREADY_REGISTERED");
    expect(await count(event)).toBe(1);
  });
  it.each(["closed", "full", "past", "draft", "cancelled", "inactive"])("rejects %s without changing registrations or the concurrency token", async key => {
    const event = fixture.events[key], before = await Competition.findById(event.competition._id).lean();
    const previous = await Registration.countDocuments({ competitionId: event.competition._id });
    const r = await post(event); expect(r.status).toBe(["draft", "cancelled", "inactive"].includes(key) ? 404 : 409);
    expect(await Registration.countDocuments({ competitionId: event.competition._id })).toBe(previous);
    expect((await Competition.findById(event.competition._id).lean()).registrationVersion).toBe(before.registrationVersion);
  });
  it("rejects a division from another event and a forged identity without partial writes", async () => {
    const event = await fixture.makeEvent();
    expect((await post(event, 0, { divisionId: String(fixture.events.open.division._id) })).status).toBe(400);
    expect((await post(event, 0, { divisionId: String(event.division._id), climberId: String(fixture.users[1]._id) })).status).toBe(400);
    expect(await count(event)).toBe(0); expect((await Competition.findById(event.competition._id).lean()).registrationVersion).toBe(0);
  });
  it("rolls back the guard write if the registration insert fails", async () => {
    const event = await fixture.makeEvent();
    const insert = vi.spyOn(Registration, "create").mockRejectedValueOnce(new Error("fixture insert failure"));
    const r = await post(event); insert.mockRestore(); expect(r.status).toBe(500);
    expect(await count(event)).toBe(0); expect((await Competition.findById(event.competition._id).lean()).registrationVersion).toBe(0);
    expect((await post(event)).status).toBe(201);
  });
  it("keeps capacity valid when an administrator shrinks it during registration", async () => {
    for (let i = 0; i < 12; i++) {
      const event = await fixture.makeEvent({ capacity: 2 }); expect((await post(event, 0)).status).toBe(201);
      const [signup, edit] = await Promise.all([
        post(event, 1),
        request(api).patch(`/api/gym-admin/competitions/${event.competition._id}`).set("Authorization", "Bearer " + tokens[12]).send({ capacity: 1 }),
      ]);
      const saved = await Competition.findById(event.competition._id).lean(); expect(await count(event)).toBeLessThanOrEqual(saved.capacity);
      expect([[201, 400], [409, 200]]).toContainEqual([signup.status, edit.status]);
    }
  }, 30000);
  it("denies Visitor, Gym Admin and System Admin without touching registration state", async () => {
    const event = await fixture.makeEvent(); expect((await request(api).post(endpoint(event)).send({ divisionId: String(event.division._id) })).status).toBe(401);
    for (const user of [12, 13]) expect((await post(event, user)).status).toBe(403);
    expect(await count(event)).toBe(0);
  });
});
