import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import {
  CLIMBERS,
  COMPETITION,
  OPEN,
  OTHER_COMPETITION,
  OTHER_DIVISION,
  YOUTH,
  installStandingsDatabase,
  standingsData,
} from "./helpers/standingsDatabase.js";

let data;

function api({ userId, role }) {
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

function standings(climber = CLIMBERS.sam, { competition = COMPETITION, query = "", role = "CLIMBER" } = {}) {
  return request(api({ userId: climber._id, role }))
    .get(`/api/competitions/${competition}/leaderboard${query}`)
    .set("Authorization", "Bearer test.access.token");
}

const divisionNamed = (body, name) => body.divisions.find((division) => division.name === name);
const rows = (division) =>
  division.standings.map((entry) => [
    `${entry.climber.firstName} ${entry.climber.lastName}`,
    entry.rank,
    entry.tied,
    entry.totalScore,
  ]);

beforeEach(() => {
  data = standingsData();
  installStandingsDatabase(data);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("US-032 #32.1 current standings API", () => {
  it("answers the current standings of the Climber's competition, ranked within each division", async () => {
    const response = await standings();

    expect(response.status).toBe(200);
    expect(response.body.audience).toBe("climber");
    expect(response.body.competition).toMatchObject({ _id: COMPETITION, name: "Fall Boulder Bash", date: "2026-11-14" });
    expect(response.body.divisions.map((division) => division.name)).toEqual(["Open", "Youth"]);
    expect(rows(divisionNamed(response.body, "Open"))).toEqual([
      ["Alex Moreau", 1, false, 460],
      ["Kim Chen", 2, true, 260],
      ["Sam Rivera", 2, true, 260],
      ["Lee Park", 4, false, 0],
    ]);
    expect(rows(divisionNamed(response.body, "Youth"))).toEqual([["Max Young", 1, false, 100]]);
  });

  it("ranks equal totals in one shared place, listed by name, whatever their sends and flashes", async () => {
    const open = divisionNamed((await standings()).body, "Open");
    const [kim, sam] = open.standings.slice(1, 3);

    expect([kim.flashes, sam.flashes]).toEqual([0, 1]);
    expect([kim.rank, sam.rank]).toEqual([2, 2]);
    expect(open.standings[3].rank).toBe(4);
  });

  it("scores the official results with the competition's current rules", async () => {
    data.competitions[0].scoring = { deductionPercent: 10, maxAttempts: 5 };

    const open = divisionNamed((await standings()).body, "Open");

    expect(rows(open)).toEqual([
      ["Alex Moreau", 1, false, 480],
      ["Kim Chen", 2, false, 330],
      ["Sam Rivera", 3, false, 280],
      ["Lee Park", 4, false, 0],
    ]);
  });

  it("ranks only CONFIRMED Climbers, each against their own division", async () => {
    const response = await standings();
    const names = response.body.divisions.flatMap((division) =>
      division.standings.map((entry) => entry.climber.firstName),
    );

    expect(names).not.toContain("Pat");
    expect(names).not.toContain("Ola");
    expect(names).not.toContain("Una");
    expect(divisionNamed(response.body, "Open").climberCount).toBe(4);
  });

  it("returns the Climber's own place, totals, and how far they are behind", async () => {
    const response = await standings(CLIMBERS.sam);

    expect(response.body.myEntry).toEqual({
      entryId: "6650000000000000000000f3",
      division: { _id: OPEN, name: "Open" },
      rank: 2,
      tied: true,
      totalScore: 260,
      of: 4,
      sends: 2,
      flashes: 1,
      problemsRecorded: 2,
      pointsBehindLeader: 200,
      placeAbove: { rank: 1, pointsBehind: 200 },
    });
    expect(response.body.myRegistration).toEqual({ status: "CONFIRMED", division: { _id: OPEN, name: "Open" } });
  });

  it("returns first place with nobody above it", async () => {
    const { myEntry } = (await standings(CLIMBERS.alex)).body;

    expect(myEntry).toMatchObject({ rank: 1, tied: false, totalScore: 460, pointsBehindLeader: 0, placeAbove: null });
  });

  it("measures the gap to the nearest place above, which can be a shared one", async () => {
    const { myEntry } = (await standings(CLIMBERS.lee)).body;

    expect(myEntry).toMatchObject({
      rank: 4,
      totalScore: 0,
      problemsRecorded: 0,
      pointsBehindLeader: 460,
      placeAbove: { rank: 2, pointsBehind: 260 },
    });
  });

  it("finds the Climber's place in their own division", async () => {
    const { myEntry } = (await standings(CLIMBERS.max)).body;

    expect(myEntry).toMatchObject({ division: { _id: YOUTH, name: "Youth" }, rank: 1, of: 1, placeAbove: null });
  });

  it.each([
    ["the waitlist", CLIMBERS.pat, "WAITLIST"],
    ["a pending place", CLIMBERS.ola, "PENDING"],
  ])("says why a Climber on %s has no place", async (_label, climber, status) => {
    const response = await standings(climber);

    expect(response.status).toBe(200);
    expect(response.body.myEntry).toBeNull();
    expect(response.body.myRegistration).toEqual({ status, division: { _id: OPEN, name: "Open" } });
  });

  it("answers a competition without results, with everyone level at 0", async () => {
    data.results = [];

    const response = await standings(CLIMBERS.sam);

    expect(response.status).toBe(200);
    expect(response.body.lastResultAt).toBeNull();
    expect(rows(divisionNamed(response.body, "Open")).map(([, rank, tied, score]) => [rank, tied, score])).toEqual([
      [1, true, 0],
      [1, true, 0],
      [1, true, 0],
      [1, true, 0],
    ]);
    expect(response.body.myEntry).toMatchObject({ rank: 1, tied: true, pointsBehindLeader: 0, placeAbove: null });
  });

  it("answers when the last official result was recorded", async () => {
    const latest = data.results.filter((row) => row.competitionId === COMPETITION).at(-1).updatedAt;

    expect((await standings()).body.lastResultAt).toBe(latest.toISOString());
  });

  it("answers one division when asked, and still the Climber's own place", async () => {
    const response = await standings(CLIMBERS.sam, { query: `?divisionId=${YOUTH}` });

    expect(response.body.divisions.map((division) => division.name)).toEqual(["Youth"]);
    expect(response.body.myEntry.division.name).toBe("Open");
  });

  it("refuses a division of another competition", async () => {
    const response = await standings(CLIMBERS.sam, { query: `?divisionId=${OTHER_DIVISION}` });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "VALIDATION_ERROR",
      fields: { divisionId: "Choose a division from this competition." },
    });
  });

  it("keeps each competition's standings to its own results", async () => {
    const response = await standings(CLIMBERS.una, { competition: OTHER_COMPETITION });

    expect(response.status).toBe(200);
    expect(rows(divisionNamed(response.body, "Open"))).toEqual([["Una Ward", 1, false, 500]]);
  });

  it("refuses a Climber who isn't registered while the leaderboard isn't public", async () => {
    const response = await standings(CLIMBERS.una);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "REGISTRATION_NOT_FOUND",
      message: "You're not registered for this competition, and its leaderboard isn't public.",
    });
  });

  it("shows a public leaderboard to a Climber who isn't registered, without a place", async () => {
    data.competitions[0].publicLeaderboard = true;

    const response = await standings(CLIMBERS.una);

    expect(response.status).toBe(200);
    expect(response.body.myEntry).toBeNull();
    expect(response.body.myRegistration).toBeNull();
  });

  it.each([
    ["a draft", () => (data.competitions[0].status = "DRAFT")],
    ["a missing competition", () => (data.competitions = data.competitions.slice(1))],
  ])("answers 404 for %s", async (_label, change) => {
    change();

    const response = await standings();

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
  });

  it("rejects a malformed competition ID", async () => {
    const response = await standings(CLIMBERS.sam, { competition: "not-an-id" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("is only for logged-in Climbers", async () => {
    const anonymous = await request(api({ userId: CLIMBERS.sam._id, role: "CLIMBER" })).get(
      `/api/competitions/${COMPETITION}/leaderboard`,
    );
    const gymAdmin = await standings(CLIMBERS.sam, { role: "GYM_ADMIN" });

    expect(anonymous.status).toBe(401);
    expect(gymAdmin.status).toBe(403);
  });

  it("shows other Climbers by name only, without their account details", async () => {
    const response = await standings();
    const entries = response.body.divisions.flatMap((division) => division.standings);

    for (const entry of entries) expect(Object.keys(entry.climber).sort()).toEqual(["firstName", "lastName"]);
    expect(JSON.stringify(response.body)).not.toContain(CLIMBERS.kim._id);
  });
});
