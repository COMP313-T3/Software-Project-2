import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SELF_SCORING_REASON } from "../src/constants/scorecard.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { OfficialResult } from "../src/models/OfficialResult.js";
import { Registration } from "../src/models/Registration.js";
import { Route } from "../src/models/Route.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import { onLeaderboardChanged } from "../src/services/leaderboardEvents.js";
import { assertSelfScorer } from "../src/services/officialResultService.js";
import { logger } from "../src/utils/logger.js";
import { buildScorecard } from "../src/utils/scorecard.js";

const COMPETITION = "6650000000000000000000c1";
const OTHER_COMPETITION = "6650000000000000000000c2";
const GYM = "6650000000000000000000a1";
const SAM = "6650000000000000000000e1";
const ALEX = "6650000000000000000000e2";
const JUDGE = "6650000000000000000000e9";
const CRIMP = "6650000000000000000000b1";
const SLAB = "6650000000000000000000b2";
const UNSCORED = "6650000000000000000000b3";
const FOREIGN = "6650000000000000000000b4";
const COMPETITION_DAY = "2026-11-14";
const NOON_IN_TORONTO = new Date("2026-11-14T17:00:00Z");

const day = (date) => new Date(`${date}T00:00:00Z`);
const resultPath = (route = CRIMP, competition = COMPETITION) =>
  `/api/competitions/${competition}/scorecard/routes/${route}/result`;

let db;
let nextId;

function freshDatabase({ competition = {}, registration = {}, registered = true } = {}) {
  nextId = 0;
  db = {
    competition: {
      _id: COMPETITION,
      gymId: GYM,
      name: "Fall Boulder Bash",
      date: day(COMPETITION_DAY),
      location: "1 Bathurst St, Toronto, ON",
      status: "PUBLISHED",
      scoring: { deductionPercent: 20, maxAttempts: 5, updatedBy: JUDGE, updatedAt: day("2026-11-01") },
      ...competition,
    },
    registrations: [
      ...(registered
        ? [
            {
              _id: "6650000000000000000000f1",
              competitionId: COMPETITION,
              climberId: SAM,
              divisionId: { _id: "6650000000000000000000d1", name: "Open" },
              status: "CONFIRMED",
              ...registration,
            },
          ]
        : []),
      {
        _id: "6650000000000000000000f2",
        competitionId: COMPETITION,
        climberId: ALEX,
        divisionId: { _id: "6650000000000000000000d1", name: "Open" },
        status: "CONFIRMED",
      },
    ],
    routes: [
      { _id: CRIMP, competitionId: COMPETITION, routeNumber: "1", name: "Crimp Ladder", grade: "V2", pointValue: 100, official: true },
      { _id: SLAB, competitionId: COMPETITION, routeNumber: "2", grade: "V3", pointValue: 200, official: true },
      { _id: UNSCORED, competitionId: COMPETITION, routeNumber: "3", grade: "V4", official: true },
      { _id: FOREIGN, competitionId: OTHER_COMPETITION, routeNumber: "1", grade: "V1", pointValue: 100, official: true },
    ],
    results: [],
  };
}

const chain = (value) => {
  const query = { populate: () => query, lean: async () => structuredClone(value ?? null) };
  return query;
};
const same = (a, b) => String(a) === String(b);
const matches = (row, filter) => Object.entries(filter).every(([field, value]) => same(row[field], value));

function installDatabase() {
  vi.spyOn(Competition, "findById").mockImplementation((id) => chain(same(id, db.competition._id) ? db.competition : null));
  vi.spyOn(Gym, "findById").mockImplementation(() => chain({ _id: GYM, name: "North Wall", status: "ACTIVE" }));
  vi.spyOn(Registration, "findOne").mockImplementation((filter) =>
    chain(db.registrations.find((row) => matches(row, filter))),
  );
  vi.spyOn(Route, "findOne").mockImplementation((filter) => chain(db.routes.find((row) => matches(row, filter))));
  vi.spyOn(Route, "find").mockImplementation((filter) => chain(db.routes.filter((row) => matches(row, filter))));
  vi.spyOn(Route, "findById").mockImplementation((id) => chain(db.routes.find((row) => same(row._id, id))));
  vi.spyOn(OfficialResult, "findOne").mockImplementation((filter) => chain(db.results.find((row) => matches(row, filter))));
  vi.spyOn(OfficialResult, "find").mockImplementation((filter) => chain(db.results.filter((row) => matches(row, filter))));
  vi.spyOn(OfficialResult, "findById").mockImplementation((id) => chain(db.results.find((row) => same(row._id, id))));
  vi.spyOn(OfficialResult, "create").mockImplementation(async (fields) => {
    if (db.results.some((row) => matches(row, { competitionId: fields.competitionId, climberId: fields.climberId, routeId: fields.routeId }))) {
      throw Object.assign(new Error("duplicate key"), { code: 11000 });
    }
    nextId += 1;
    const saved = { _id: `66500000000000000000${String(nextId).padStart(4, "0")}`, ...fields, createdAt: new Date(), updatedAt: new Date() };
    db.results.push(saved);
    return { toObject: () => structuredClone(saved) };
  });
  vi.spyOn(OfficialResult, "findOneAndUpdate").mockImplementation((filter, { $set, $inc }) => {
    const row = db.results.find((entry) => matches(entry, filter));
    if (row) Object.assign(row, $set, { version: row.version + ($inc?.version ?? 0), updatedAt: new Date() });
    return chain(row);
  });
  vi.spyOn(OfficialResult, "findOneAndDelete").mockImplementation((filter) => {
    const index = db.results.findIndex((row) => matches(row, filter));
    return chain(index === -1 ? null : db.results.splice(index, 1)[0]);
  });
}

function api({ userId = SAM, role = "CLIMBER" } = {}) {
  const auth = {
    accessTokens: { verify: vi.fn(async () => ({ userId, role, sessionId: "session-id" })) },
    sessions: { findActive: vi.fn(async () => ({})), recordRequest: vi.fn(async () => ({})) },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/competitions", createCompetitionRoutes({ auth }));
  app.use(errorHandler);
  return app;
}

function save(body, { route, competition, ...who } = {}) {
  return request(api(who)).put(resultPath(route, competition)).set("Authorization", "Bearer test.access.token").send(body);
}

function clear({ route, competition, ...who } = {}) {
  return request(api(who)).delete(resultPath(route, competition)).set("Authorization", "Bearer test.access.token");
}

const routeOn = (scorecard, routeId) => scorecard.routes.find((entry) => entry.routeId === routeId);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON_IN_TORONTO);
  vi.spyOn(logger, "info").mockImplementation(() => {});
  freshDatabase();
  installDatabase();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("US-031 Climbers record their own results", () => {
  it("records the Climber's own attempt and answers their updated scorecard", async () => {
    const response = await save({ attempts: 1, sent: false });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(routeOn(response.body, CRIMP)).toMatchObject({
      status: "ATTEMPTED",
      completed: false,
      result: { attempts: 1, sent: false, officialScore: 0, attemptsLeft: 4 },
    });
    expect(response.body.summary).toMatchObject({ attempted: 1, totalAttempts: 1, totalScore: 0 });
    expect(response.body.selfScoring).toEqual({ open: true, reason: null });
    expect(db.results).toHaveLength(1);
    expect(db.results[0]).toMatchObject({ climberId: SAM, source: "CLIMBER", createdBy: SAM, updatedBy: SAM, version: 0 });
  });

  it("scores a send with the competition's rules, and a send on the first attempt as a flash", async () => {
    const flashed = await save({ attempts: 1, sent: true });
    expect(routeOn(flashed.body, CRIMP)).toMatchObject({ status: "FLASHED", result: { flash: true, officialScore: 100 } });

    const corrected = await save({ attempts: 3, sent: true });

    expect(corrected.status).toBe(200);
    expect(routeOn(corrected.body, CRIMP)).toMatchObject({ status: "SENT", result: { attempts: 3, flash: false, officialScore: 60 } });
    expect(db.results).toHaveLength(1);
    expect(db.results[0]).toMatchObject({ version: 1, sends: 1, officialScore: 60, scoredWith: { pointValue: 100, deductionPercent: 20, maxAttempts: 5 } });
  });

  it("tells the live leaderboard and the Climber's live scorecard about each change", async () => {
    const changes = [];
    const stop = onLeaderboardChanged((change) => changes.push(change));
    await save({ attempts: 2, sent: false });
    await clear();
    stop();

    expect(changes).toEqual([
      { competitionId: COMPETITION, reason: "result", climberId: SAM },
      { competitionId: COMPETITION, reason: "result", climberId: SAM },
    ]);
  });

  it("clears the Climber's own result, such as when they undo their only attempt", async () => {
    await save({ attempts: 1, sent: false });

    const response = await clear();

    expect(response.status).toBe(200);
    expect(routeOn(response.body, CRIMP)).toMatchObject({ status: "NOT_ATTEMPTED", result: null });
    expect(db.results).toHaveLength(0);
    expect((await clear()).body).toMatchObject({ error: "RESULT_NOT_FOUND", message: "You haven't recorded a result on this problem yet." });
  });

  it("only ever writes the logged-in Climber's own result", async () => {
    db.results.push({ _id: "665000000000000000009999", competitionId: COMPETITION, climberId: ALEX, routeId: CRIMP, attempts: 1, sends: 1, flash: true, officialScore: 100, version: 0 });

    const response = await save({ attempts: 2, sent: false });
    const sneaky = await save({ attempts: 2, sent: true, climberId: ALEX });

    expect(response.status).toBe(201);
    expect(db.results.filter((row) => row.climberId === ALEX)).toEqual([expect.objectContaining({ attempts: 1, officialScore: 100 })]);
    expect(db.results.filter((row) => row.climberId === SAM)).toEqual([expect.objectContaining({ attempts: 2, sends: 0 })]);
    expect(sneaky.status).toBe(400);
    expect(sneaky.body.error).toBe("VALIDATION_ERROR");
  });

  it("never takes the score, the flash or who saved it from the request", async () => {
    for (const extra of [{ officialScore: 1000 }, { flash: true }, { source: "GYM_ADMIN" }, { updatedBy: JUDGE }]) {
      const response = await save({ attempts: 1, sent: true, ...extra });
      expect(response.status, JSON.stringify(extra)).toBe(400);
    }
    expect(db.results).toHaveLength(0);
  });

  it.each([
    [{ attempts: 0, sent: false }, "attempts"],
    [{ attempts: 1.5, sent: false }, "attempts"],
    [{ attempts: "2", sent: false }, "attempts"],
    [{ attempts: 1 }, "sent"],
  ])("refuses an incomplete or invalid result %#", async (body, field) => {
    const response = await save(body);

    expect(response.status).toBe(400);
    expect(response.body.fields[field]).toBeTruthy();
  });

  it("refuses more attempts than the competition allows", async () => {
    const response = await save({ attempts: 6, sent: false });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ attempts: "This competition allows up to 5 attempts per problem." });
    expect(db.results).toHaveLength(0);
  });

  it("opens scoring at the competition's start time, and keeps it open until the end of that day", async () => {
    freshDatabase({ competition: { startTime: "13:00" } });
    const beforeTheStart = await save({ attempts: 1, sent: true });
    expect(beforeTheStart.status).toBe(409);
    expect(beforeTheStart.body).toEqual({
      error: "COMPETITION_NOT_STARTED",
      message: "This competition starts on November 14, 2026 at 1:00 p.m. You can record your results then.",
      details: { startsAt: "2026-11-14T18:00:00.000Z" },
    });
    expect(db.results).toHaveLength(0);

    vi.setSystemTime(new Date("2026-11-14T18:00:00Z"));
    const atTheStart = await save({ attempts: 1, sent: true });
    expect(atTheStart.status, JSON.stringify(atTheStart.body)).toBe(201);
    expect(atTheStart.body.selfScoring).toEqual({ open: true, reason: null });

    vi.setSystemTime(new Date("2026-11-15T04:59:00Z"));
    const lateThatNight = await save({ attempts: 2, sent: true }, { route: SLAB });
    expect(lateThatNight.status, JSON.stringify(lateThatNight.body)).toBe(201);

    vi.setSystemTime(new Date("2026-11-15T05:00:00Z"));
    const theNextDay = await clear();
    expect(theNextDay.status).toBe(409);
    expect(theNextDay.body.error).toBe("SCORING_CLOSED");
  });

  it("closes scoring at the competition's end time, and keeps the results as they were", async () => {
    freshDatabase({ competition: { startTime: "10:00", endTime: "17:00" } });
    vi.setSystemTime(new Date("2026-11-14T21:59:00Z"));
    const beforeTheEnd = await save({ attempts: 1, sent: false });
    expect(beforeTheEnd.status, JSON.stringify(beforeTheEnd.body)).toBe(201);
    const saved = structuredClone(db.results);

    vi.setSystemTime(new Date("2026-11-14T22:00:00Z"));
    const atTheEnd = await save({ attempts: 2, sent: true });
    const undo = await clear();

    for (const response of [atTheEnd, undo]) {
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: "SCORING_CLOSED",
        message: "This competition is over, so your results can't be changed anymore.",
      });
    }
    expect(db.results).toEqual(saved);
  });

  it("opens scoring only on the competition day, in Toronto", async () => {
    freshDatabase({ competition: { date: day("2026-11-15") } });
    const early = await save({ attempts: 1, sent: true });
    freshDatabase({ competition: { date: day("2026-11-13") } });
    const late = await save({ attempts: 1, sent: true });
    vi.setSystemTime(new Date("2026-11-15T04:30:00Z"));
    freshDatabase();
    const lateNightInToronto = await save({ attempts: 1, sent: true });

    expect(early.status).toBe(409);
    expect(early.body).toEqual({
      error: "COMPETITION_NOT_STARTED",
      message: "This competition starts on November 15, 2026 at 12:00 a.m. You can record your results then.",
      details: { startsAt: "2026-11-15T05:00:00.000Z" },
    });
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ error: "SCORING_CLOSED", message: "This competition is over, so your results can't be changed anymore." });
    expect(lateNightInToronto.status).toBe(201);
  });

  it.each([
    ["a cancelled competition", { competition: { status: "CANCELLED" } }, CRIMP, "COMPETITION_CANCELLED"],
    ["scoring that isn't set up", { competition: { scoring: undefined } }, CRIMP, "SCORING_NOT_CONFIGURED"],
    ["a place on the waitlist", { registration: { status: "WAITLIST" } }, CRIMP, "REGISTRATION_NOT_CONFIRMED"],
    ["a problem without points", {}, UNSCORED, "ROUTE_POINTS_MISSING"],
  ])("refuses %s", async (_name, setup, route, code) => {
    freshDatabase(setup);

    const response = await save({ attempts: 1, sent: true }, { route });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(code);
    expect(db.results).toHaveLength(0);
  });

  it.each([
    ["a competition the Climber isn't registered for", { registered: false }, CRIMP, COMPETITION, "REGISTRATION_NOT_FOUND"],
    ["a draft competition", { competition: { status: "DRAFT" } }, CRIMP, COMPETITION, "COMPETITION_NOT_FOUND"],
    ["a competition that doesn't exist", {}, CRIMP, OTHER_COMPETITION, "COMPETITION_NOT_FOUND"],
    ["a problem from another competition", {}, FOREIGN, COMPETITION, "ROUTE_NOT_FOUND"],
  ])("answers 404 for %s", async (_name, setup, route, competition, code) => {
    freshDatabase(setup);

    const response = await save({ attempts: 1, sent: true }, { route, competition });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe(code);
  });

  it("is only for logged-in Climbers", async () => {
    const asGymAdmin = await save({ attempts: 1, sent: true }, { userId: JUDGE, role: "GYM_ADMIN" });
    const anonymous = await request(api()).put(resultPath()).send({ attempts: 1, sent: true });
    const badRoute = await save({ attempts: 1, sent: true }, { route: "not-an-id" });

    expect(asGymAdmin.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(badRoute.status).toBe(400);
    expect(db.results).toHaveLength(0);
  });

  it("refuses anyone but a Climber at the service boundary too", () => {
    for (const actor of [undefined, { userId: JUDGE, role: "GYM_ADMIN" }, { userId: "ai", role: "AI" }, { role: "CLIMBER" }]) {
      expect(() => assertSelfScorer(actor)).toThrow("Climbers record their own results from their scorecard.");
    }
    expect(() => assertSelfScorer({ userId: SAM, role: "CLIMBER" })).not.toThrow();
  });

  it("accepts results saved by a Climber in the result model", async () => {
    const saved = new OfficialResult({
      competitionId: COMPETITION,
      routeId: CRIMP,
      climberId: SAM,
      attempts: 1,
      sends: 1,
      flash: true,
      officialScore: 100,
      scoredWith: { pointValue: 100, deductionPercent: 20, maxAttempts: 5 },
      source: "CLIMBER",
      createdBy: SAM,
      updatedBy: SAM,
    });

    await expect(saved.validate()).resolves.toBeUndefined();
  });
});

describe("US-031 whether the scorecard is open for scoring", () => {
  const build = ({ competition = {}, registration = {}, today = day(COMPETITION_DAY) } = {}) =>
    buildScorecard({
      competition: { ...db.competition, ...competition },
      gym: { _id: GYM, name: "North Wall", status: "ACTIVE" },
      registration: { ...db.registrations[0], ...registration },
      routes: db.routes.filter((route) => route.competitionId === COMPETITION),
      results: [],
      today,
    }).selfScoring;

  it("is open on the competition day for a confirmed Climber once scoring is set", () => {
    expect(build()).toEqual({ open: true, reason: null });
  });

  it.each([
    ["the competition was cancelled", { competition: { status: "CANCELLED", date: day("2026-11-01") } }, SELF_SCORING_REASON.CANCELLED],
    ["the competition day hasn't come", { competition: { date: day("2026-11-20") } }, SELF_SCORING_REASON.NOT_STARTED],
    ["the competition day has passed", { competition: { date: day("2026-11-01") } }, SELF_SCORING_REASON.CLOSED],
    ["scoring isn't set up", { competition: { scoring: undefined } }, SELF_SCORING_REASON.NO_SCORING],
    ["the place isn't confirmed", { registration: { status: "WAITLIST" } }, SELF_SCORING_REASON.NOT_CONFIRMED],
  ])("is closed when %s", (_name, setup, reason) => {
    expect(build(setup)).toEqual({ open: false, reason });
  });
});

describe("US-031 the Climber's name on their scorecard", () => {
  const scorecardFor = (climberId) =>
    buildScorecard({
      competition: db.competition,
      gym: { _id: GYM, name: "North Wall", status: "ACTIVE" },
      registration: { ...db.registrations[0], climberId },
      routes: [],
      results: [],
      today: day(COMPETITION_DAY),
    });

  it("shows the Climber's own name, for the score sheet", () => {
    expect(scorecardFor({ _id: SAM, firstName: "Sam", lastName: "Rivera" }).climber).toEqual({ firstName: "Sam", lastName: "Rivera" });
  });

  it("leaves it out when the name couldn't be read", () => {
    expect(scorecardFor(SAM).climber).toBeNull();
    expect(scorecardFor(null).climber).toBeNull();
  });
});

