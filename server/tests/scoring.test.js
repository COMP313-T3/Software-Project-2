import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { Route } from "../src/models/Route.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { loadScoringRules } from "../src/services/scoringService.js";
import { parseCalendarDate, torontoToday } from "../src/utils/calendarDates.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

const COMPETITION_ID = "507f1f77bcf86cd799439011";
const GYM_ID = "507f1f77bcf86cd799439012";
const OTHER_GYM_ID = "507f1f77bcf86cd799439013";
const ADMIN_ID = "507f1f77bcf86cd799439001";
const AUTH = "Bearer header.payload.signature";
const endpoint = `/api/gym-admin/competitions/${COMPETITION_ID}/scoring`;
const savedAt = new Date("2026-10-21T15:00:00.000Z");
const objectId = (value) => new mongoose.Types.ObjectId(value);
const DEDUCTION_MESSAGE = "Enter a whole-number percentage from 0 to 99.";
const ATTEMPTS_MESSAGE = "Enter a whole number of attempts from 1 to 20.";
const tooLarge = (attempts, largest) =>
  `With ${attempts} attempts, the deduction can be at most ${largest}% so a top on the last attempt still scores.`;

function daysFromToday(days) {
  const date = parseCalendarDate(torontoToday()).date;
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function competition(changes = {}) {
  return {
    _id: objectId(COMPETITION_ID),
    gymId: objectId(GYM_ID),
    name: "Autumn Open",
    date: daysFromToday(30),
    location: "Toronto",
    capacity: 40,
    status: "PUBLISHED",
    registrationStatus: "OPEN",
    scoring: {
      deductionPercent: 20,
      maxAttempts: 5,
      updatedBy: objectId(ADMIN_ID),
      updatedAt: savedAt,
    },
    ...changes,
  };
}

function query(value) {
  const result = {
    collation: vi.fn(() => result),
    sort: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app(role = "GYM_ADMIN") {
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
  const api = express();
  api.use(express.json());
  api.use("/api/gym-admin", createGymAdminRoutes({ auth }));
  api.use(errorHandler);
  return api;
}

function read(api, authenticate = true) {
  const test = request(api).get(endpoint);
  return authenticate ? test.set("Authorization", AUTH) : test;
}

function save(api, body, authenticate = true) {
  const test = request(api).put(endpoint);
  if (authenticate) test.set("Authorization", AUTH);
  return test.send(body);
}

/** The competition the database holds, found only through a query limited to its gym. */
let stored;

beforeEach(() => {
  stored = competition();
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(Gym, "find").mockReturnValue(
    query([{ _id: objectId(GYM_ID), name: "North Gym", location: "Toronto" }]),
  );
  vi.spyOn(Competition.collection, "findOne").mockImplementation(async (filter) =>
    String(filter._id) === COMPETITION_ID &&
    filter.gymId?.$in?.some((id) => String(id) === String(stored.gymId))
      ? stored
      : null,
  );
  vi.spyOn(Competition, "findOneAndUpdate").mockImplementation((_filter, update) =>
    query({ _id: stored._id, scoring: update.$set.scoring }),
  );
  vi.spyOn(Route, "countDocuments").mockImplementation(async (filter) =>
    filter.pointValue ? 1 : 4,
  );
});

afterEach(() => vi.restoreAllMocks());

describe("US-018 reading a competition's scoring settings", () => {
  it("answers the saved settings and what's still missing before results", async () => {
    const response = await read(app());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      competitionId: COMPETITION_ID,
      scoring: {
        deductionPercent: 20,
        maxAttempts: 5,
        updatedBy: ADMIN_ID,
        updatedAt: savedAt.toISOString(),
      },
      readiness: {
        routes: 4,
        routesWithoutPoints: 1,
        ready: false,
        warnings: [
          "1 route has no point value yet. Give every route points before results are entered.",
        ],
      },
    });
  });

  it("is ready once every route has points", async () => {
    vi.mocked(Route.countDocuments).mockImplementation(async (filter) =>
      filter.pointValue ? 0 : 4,
    );

    const response = await read(app());

    expect(response.body.readiness).toEqual({
      routes: 4,
      routesWithoutPoints: 0,
      ready: true,
      warnings: [],
    });
  });

  it.each([
    ["no scoring", undefined],
    ["a format and flash bonus", { format: "POINTS", flashBonus: 10, updatedBy: objectId(ADMIN_ID), updatedAt: savedAt }],
    ["a format without a bonus", { format: "TOPS" }],
    ["a deduction too large for its attempts", { deductionPercent: 30, maxAttempts: 5 }],
  ])("treats a competition with %s as not set", async (_, scoring) => {
    stored = competition({ scoring });

    const response = await read(app());

    expect(response.status).toBe(200);
    expect(response.body.scoring).toBeNull();
    expect(response.body.readiness.warnings).toContain(
      "Set the competition's scoring before results are entered.",
    );
  });

  it("answers 404 for another gym's competition", async () => {
    stored = competition({ gymId: objectId(OTHER_GYM_ID) });

    const response = await read(app());

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Route.countDocuments).not.toHaveBeenCalled();
  });

  it("needs a login before reading anything", async () => {
    const response = await read(app(), false);

    expect(response.status).toBe(401);
    expect(Gym.find).not.toHaveBeenCalled();
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "CLIMBER", "VISITOR"])("refuses the %s role", async (role) => {
    const response = await read(app(role));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_FORBIDDEN");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });

  it("rejects a malformed competition ID before looking it up", async () => {
    const response = await request(app())
      .get("/api/gym-admin/competitions/not-an-id/scoring")
      .set("Authorization", AUTH);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });
});

describe("US-018 saving a competition's scoring settings", () => {
  it("saves the settings in the competition's own gym, recording who and when", async () => {
    const response = await save(app(), {
      deductionPercent: 25,
      maxAttempts: 4,
      format: "POINTS",
      flashBonus: 10,
      updatedBy: "forged-user",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });

    expect(response.status).toBe(200);
    expect(response.body.scoring).toEqual({
      deductionPercent: 25,
      maxAttempts: 4,
      updatedBy: ADMIN_ID,
      updatedAt: expect.any(String),
    });
    expect(new Date(response.body.scoring.updatedAt).getTime()).toBeGreaterThan(savedAt.getTime());
    expect(Competition.findOneAndUpdate).toHaveBeenCalledOnce();
    expect(Competition.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: stored._id, gymId: stored.gymId },
      {
        $set: {
          scoring: {
            deductionPercent: 25,
            maxAttempts: 4,
            updatedBy: ADMIN_ID,
            updatedAt: expect.any(Date),
          },
        },
      },
      { returnDocument: "after", runValidators: true, projection: "scoring" },
    );
  });

  it("accepts whole numbers sent as text", async () => {
    const response = await save(app(), { deductionPercent: "10", maxAttempts: "8" });

    expect(response.status).toBe(200);
    expect(response.body.scoring).toMatchObject({ deductionPercent: 10, maxAttempts: 8 });
  });

  it.each([
    [99, 1],
    [99, 2],
    [49, 3],
    [24, 5],
    [0, 20],
    [5, 20],
  ])("accepts a %i percent deduction when maxAttempts is %i", async (deduction, attempts) => {
    const response = await save(app(), { deductionPercent: deduction, maxAttempts: attempts });

    expect(response.status).toBe(200);
    expect(response.body.scoring).toMatchObject({
      deductionPercent: deduction,
      maxAttempts: attempts,
    });
  });

  it.each([
    [25, 5, 24],
    [50, 3, 49],
    [6, 20, 5],
    [99, 3, 49],
  ])(
    "refuses a %i percent deduction when maxAttempts is %i, so a top on the last attempt still scores",
    async (deduction, attempts, largest) => {
      const response = await save(app(), {
        deductionPercent: deduction,
        maxAttempts: attempts,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "VALIDATION_ERROR",
        message: "Check the fields and try again.",
        fields: { deductionPercent: tooLarge(attempts, largest) },
      });
      expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );

  it("explains the largest deduction for 5 attempts in plain words", async () => {
    const response = await save(app(), { deductionPercent: 30, maxAttempts: 5 });

    expect(response.body.fields.deductionPercent).toBe(
      "With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores.",
    );
  });

  it.each([
    [{ maxAttempts: 5 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ deductionPercent: 20 }, { maxAttempts: ATTEMPTS_MESSAGE }],
    [{ deductionPercent: -1, maxAttempts: 5 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ deductionPercent: 100, maxAttempts: 1 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ deductionPercent: 12.5, maxAttempts: 5 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ deductionPercent: "abc", maxAttempts: 5 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ deductionPercent: null, maxAttempts: 5 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ deductionPercent: 20, maxAttempts: 0 }, { maxAttempts: ATTEMPTS_MESSAGE }],
    [{ deductionPercent: 20, maxAttempts: 21 }, { maxAttempts: ATTEMPTS_MESSAGE }],
    [{ deductionPercent: 20, maxAttempts: 2.5 }, { maxAttempts: ATTEMPTS_MESSAGE }],
    [
      { format: "POINTS", flashBonus: 10 },
      { deductionPercent: DEDUCTION_MESSAGE, maxAttempts: ATTEMPTS_MESSAGE },
    ],
  ])("refuses %j before saving", async (body, fields) => {
    const response = await save(app(), body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields).toEqual(fields);
    expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("can't change a cancelled competition's scoring", async () => {
    stored = competition({ status: "CANCELLED" });

    const response = await save(app(), { deductionPercent: 10, maxAttempts: 5 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "COMPETITION_CANCELLED",
      message: "A cancelled competition's scoring can't be changed.",
    });
    expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("can't change the scoring after the competition date", async () => {
    stored = competition({ date: daysFromToday(-1) });

    const response = await save(app(), { deductionPercent: 10, maxAttempts: 5 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "COMPETITION_FINISHED",
      message: "Scoring can't be changed after the competition date.",
    });
    expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("can still change the scoring on the competition date", async () => {
    stored = competition({ date: daysFromToday(0) });

    const response = await save(app(), { deductionPercent: 10, maxAttempts: 5 });

    expect(response.status).toBe(200);
  });

  it("answers 404 for another gym's competition without saving", async () => {
    stored = competition({ gymId: objectId(OTHER_GYM_ID) });

    const response = await save(app(), { deductionPercent: 10, maxAttempts: 5 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("answers 404 when the competition is gone by the time it's saved", async () => {
    vi.mocked(Competition.findOneAndUpdate).mockReturnValue(query(null));

    const response = await save(app(), { deductionPercent: 10, maxAttempts: 5 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
  });

  it("needs a login before reading or saving anything", async () => {
    const response = await save(app(), { deductionPercent: 10, maxAttempts: 5 }, false);

    expect(response.status).toBe(401);
    expect(Gym.find).not.toHaveBeenCalled();
    expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "CLIMBER", "VISITOR"])("refuses the %s role", async (role) => {
    const response = await save(app(role), { deductionPercent: 10, maxAttempts: 5 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_FORBIDDEN");
    expect(Competition.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("US-012 and US-018 scoring saved when a competition is created", () => {
  const body = {
    name: "Winter Open",
    date: daysFromToday(30).toISOString().slice(0, 10),
    capacity: 40,
  };

  function create(details) {
    return request(app())
      .post("/api/gym-admin/competitions")
      .set("Authorization", AUTH)
      .send(details);
  }

  beforeEach(() => {
    vi.spyOn(Competition, "create").mockImplementation(
      async (details) => new Competition({ _id: objectId(COMPETITION_ID), ...details }),
    );
  });

  it("saves the chosen settings as the competition's scoring, set by its creator", async () => {
    const response = await create({ ...body, deductionPercent: 25, maxAttempts: 4 });

    expect(response.status).toBe(201);
    expect(Competition.create.mock.calls[0][0].scoring).toEqual({
      deductionPercent: 25,
      maxAttempts: 4,
      updatedBy: ADMIN_ID,
      updatedAt: expect.any(Date),
    });
    expect(response.body.scoring).toEqual({
      deductionPercent: 25,
      maxAttempts: 4,
      updatedBy: ADMIN_ID,
      updatedAt: expect.any(String),
    });
  });

  it("starts with 20% and 5 attempts when the settings are left out", async () => {
    const response = await create(body);

    expect(response.status).toBe(201);
    expect(response.body.scoring).toMatchObject({ deductionPercent: 20, maxAttempts: 5 });
  });

  it.each([
    [{ deductionPercent: 30 }, { deductionPercent: tooLarge(5, 24) }],
    [{ deductionPercent: 50, maxAttempts: 3 }, { deductionPercent: tooLarge(3, 49) }],
    [{ deductionPercent: 100 }, { deductionPercent: DEDUCTION_MESSAGE }],
    [{ maxAttempts: 21 }, { maxAttempts: ATTEMPTS_MESSAGE }],
  ])("refuses %j before creating anything", async (settings, fields) => {
    const response = await create({ ...body, ...settings });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(fields);
    expect(Competition.create).not.toHaveBeenCalled();
  });
});

describe("US-018 scoring on the competition details", () => {
  beforeEach(() => {
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
  });

  it("shows the saved settings", async () => {
    const response = await request(app())
      .get(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(response.body.scoring).toEqual({
      deductionPercent: 20,
      maxAttempts: 5,
      updatedBy: ADMIN_ID,
      updatedAt: savedAt.toISOString(),
    });
  });

  it("shows a format and flash bonus as not set", async () => {
    stored = competition({ scoring: { format: "POINTS", flashBonus: 10 } });

    const response = await request(app())
      .get(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(response.body.scoring).toBeNull();
  });
});

describe("US-018 scoring settings in the Competition model", () => {
  async function errorsOf(scoring) {
    const details = {
      gymId: objectId(GYM_ID),
      name: "Autumn Open",
      date: daysFromToday(30),
      location: "Toronto",
      capacity: 40,
      createdBy: objectId(ADMIN_ID),
      scoring: { updatedBy: objectId(ADMIN_ID), updatedAt: savedAt, ...scoring },
    };
    try {
      await new Competition(details).validate();
      return [];
    } catch (error) {
      return Object.keys(error.errors).sort();
    }
  }

  it("keeps the same limits as the API", async () => {
    expect(await errorsOf({ deductionPercent: 24, maxAttempts: 5 })).toEqual([]);
    expect(await errorsOf({ deductionPercent: 99, maxAttempts: 1 })).toEqual([]);
    expect(await errorsOf({ deductionPercent: 5, maxAttempts: 20 })).toEqual([]);
    expect(await errorsOf({ deductionPercent: 25, maxAttempts: 5 })).toEqual([
      "scoring.deductionPercent",
    ]);
    expect(await errorsOf({ deductionPercent: 100, maxAttempts: 1 })).toEqual([
      "scoring.deductionPercent",
    ]);
    expect(await errorsOf({ deductionPercent: 2.5, maxAttempts: 5 })).toEqual([
      "scoring.deductionPercent",
    ]);
    expect(await errorsOf({ deductionPercent: 20, maxAttempts: 0 })).toEqual([
      "scoring.maxAttempts",
    ]);
    expect(await errorsOf({ deductionPercent: 4, maxAttempts: 21 })).toEqual([
      "scoring.maxAttempts",
    ]);
  });

  it("can't store a format and flash bonus as scoring", async () => {
    expect(await errorsOf({ format: "POINTS", flashBonus: 10 })).toEqual([
      "scoring.deductionPercent",
      "scoring.maxAttempts",
    ]);
  });
});

describe("US-018 official scoring rules for result entry", () => {
  it("gives frozen settings that can't be changed by their users", async () => {
    vi.spyOn(Competition, "findById").mockReturnValue(query(competition()));

    const rules = await loadScoringRules(COMPETITION_ID);

    expect(rules).toEqual({ deductionPercent: 20, maxAttempts: 5 });
    expect(Object.isFrozen(rules)).toBe(true);
  });

  it.each([undefined, { format: "POINTS", flashBonus: 10 }])(
    "refuses to score a competition whose scoring is %j",
    async (scoring) => {
      vi.spyOn(Competition, "findById").mockReturnValue(query(competition({ scoring })));

      await expect(loadScoringRules(COMPETITION_ID)).rejects.toMatchObject({
        status: 409,
        code: "SCORING_NOT_CONFIGURED",
      });
    },
  );

  it("answers 404 for a competition that doesn't exist", async () => {
    vi.spyOn(Competition, "findById").mockReturnValue(query(null));

    await expect(loadScoringRules(COMPETITION_ID)).rejects.toMatchObject({
      status: 404,
      code: "COMPETITION_NOT_FOUND",
    });
  });
});
