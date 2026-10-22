import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { User } from "../src/models/User.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";

const USER_ID = "507f1f77bcf86cd799439013";
const HOGTOWN_ID = "507f1f77bcf86cd799439021";
const JUNCTION_ID = "507f1f77bcf86cd799439022";
const NORTH_ID = "507f1f77bcf86cd799439023";
const CLOSED_GYM_ID = "507f1f77bcf86cd799439024";
const COMPETITION_ID = "507f1f77bcf86cd799439031";
const SECOND_COMPETITION_ID = "507f1f77bcf86cd799439032";
const DIVISION_ID = "507f1f77bcf86cd799439041";
const AUTH = "Bearer a.b.c";
// 10:30 PM on November 14 in Toronto, when it's already November 15 in UTC.
const NOW = new Date("2026-11-15T03:30:00.000Z");
const TODAY = "2026-11-14T00:00:00.000Z";
const NOT_FOUND = {
  error: "COMPETITION_NOT_FOUND",
  message: "Competition not found.",
};

const objectId = (value) => new mongoose.Types.ObjectId(value);
const hogtown = {
  _id: objectId(HOGTOWN_ID),
  name: "Hogtown Boulders",
  location: "Toronto",
};
const junction = {
  _id: objectId(JUNCTION_ID),
  name: "Junction Wall",
  location: "Toronto",
};
const north = {
  _id: objectId(NORTH_ID),
  name: "North Wall",
  location: "Toronto",
};

const autumnOpen = {
  _id: objectId(COMPETITION_ID),
  gymId: north._id,
  name: "Autumn Open",
  date: new Date("2026-11-20T00:00:00.000Z"),
  location: "Toronto",
  registrationStatus: "OPEN",
  capacity: 80,
};
const harbourJam = {
  _id: objectId(SECOND_COMPETITION_ID),
  gymId: hogtown._id,
  name: "Harbour Jam",
  date: new Date("2026-11-28T00:00:00.000Z"),
  location: "Toronto",
  registrationStatus: "CLOSED",
  capacity: 2,
};
const published = {
  ...autumnOpen,
  description: "A local bouldering competition.",
  status: "PUBLISHED",
};

function query(value) {
  const result = {
    collation: vi.fn(() => result),
    sort: vi.fn(() => result),
    skip: vi.fn(() => result),
    limit: vi.fn(() => result),
    populate: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: USER_ID,
        role: "CLIMBER",
        sessionId: "session-id",
      })),
    },
    sessions: {
      findActive: vi.fn(async () => ({})),
      recordRequest: vi.fn(async () => ({})),
    },
  };
  const api = express();
  api.use("/api/competitions", createCompetitionRoutes({ auth }));
  api.use(errorHandler);
  return api;
}

function get(path) {
  return request(app()).get(path).set("Authorization", AUTH);
}

/** Stubs the List View's reads, with the active gyms in name order as the query sorts them. */
function listed(
  competitions,
  { total = competitions.length, confirmed = [] } = {},
) {
  vi.spyOn(Gym, "find").mockReturnValue(query([hogtown, north]));
  const results = query(competitions);
  vi.spyOn(Competition, "find").mockReturnValue(results);
  vi.spyOn(Competition, "countDocuments").mockResolvedValue(total);
  vi.spyOn(Registration, "aggregate").mockResolvedValue(confirmed);
  return results;
}

/**
 * A filter as MongoDB receives it. The API runs with sanitizeFilter on, which makes any operator
 * the server didn't mark as trusted a plain value, so a filter that loses its trust stops matching.
 * IDs and dates come out as strings.
 */
function sent(filter) {
  return JSON.parse(JSON.stringify(mongoose.sanitizeFilter(filter)));
}

function listFilter() {
  return sent(Competition.find.mock.calls[0][0]);
}

function matches(document, filter) {
  return Object.entries(filter).every(
    ([key, value]) => String(document[key]) === String(value),
  );
}

/** Answers the Event Details lookups the way MongoDB would for one stored competition and gym. */
function stored(competition, gym) {
  vi.spyOn(Competition, "findOne").mockImplementation((filter) =>
    query(competition && matches(competition, filter) ? competition : null),
  );
  vi.spyOn(Gym, "findOne").mockImplementation((filter) =>
    query(matches(gym, filter) ? gym : null),
  );
  vi.spyOn(Division, "find").mockReturnValue(
    query([{ _id: objectId(DIVISION_ID), name: "Open" }]),
  );
  vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
  vi.spyOn(Registration, "findOne").mockReturnValue(query(null));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/competitions (US-025, US-026)", () => {
  it("lists published competitions of active gyms dated today or later in Toronto", async () => {
    listed([autumnOpen, harbourJam], {
      confirmed: [{ _id: harbourJam._id, count: 2 }],
    });

    const response = await get("/api/competitions");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Gym.find.mock.calls[0][0]).toEqual({ status: "ACTIVE" });
    expect(listFilter()).toEqual({
      status: "PUBLISHED",
      gymId: { $in: [HOGTOWN_ID, NORTH_ID] },
      date: { $gte: TODAY },
    });
    expect(Registration.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        competitionId: { $in: [autumnOpen._id, harbourJam._id] },
        status: "CONFIRMED",
      },
    });
    expect(response.body).toMatchObject({
      competitions: [
        {
          _id: COMPETITION_ID,
          name: "Autumn Open",
          date: "2026-11-20",
          gym: { _id: NORTH_ID, name: "North Wall" },
          registrationStatus: "OPEN",
          capacity: 80,
          spacesLeft: 80,
          full: false,
        },
        {
          _id: SECOND_COMPETITION_ID,
          name: "Harbour Jam",
          date: "2026-11-28",
          gym: { _id: HOGTOWN_ID, name: "Hogtown Boulders" },
          registrationStatus: "CLOSED",
          capacity: 2,
          spacesLeft: 0,
          full: true,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it("matches each of the first five search words as plain text in the name, location or gym name", async () => {
    listed([]);

    await get(
      `/api/competitions?q=${encodeURIComponent(" north .* (open)  boulders extra sixth ")}`,
    );

    const text = (pattern) => ({ $regex: pattern, $options: "i" });
    const word = (pattern, gymIds) => ({
      $or: [
        { name: text(pattern) },
        { location: text(pattern) },
        { gymId: { $in: gymIds } },
      ],
    });
    expect(listFilter().$and).toEqual([
      word("north", [NORTH_ID]),
      word("\\.\\*", []),
      word("\\(open\\)", []),
      word("boulders", [HOGTOWN_ID]),
      word("extra", []),
    ]);
  });

  it.each([
    ["that gym when it's active", HOGTOWN_ID, [HOGTOWN_ID]],
    ["nothing for a gym that isn't active", CLOSED_GYM_ID, []],
  ])("narrows the gym filter to %s", async (_, gymId, gymIds) => {
    listed([]);

    await get(`/api/competitions?gymId=${gymId}`);

    expect(listFilter().gymId).toEqual({ $in: gymIds });
  });

  it.each([
    [
      "the range chosen after today",
      "from=2026-11-20&to=2026-12-31",
      { $gte: "2026-11-20T00:00:00.000Z", $lte: "2026-12-31T00:00:00.000Z" },
    ],
    [
      "today up to the end date",
      "to=2026-11-30",
      { $gte: TODAY, $lte: "2026-11-30T00:00:00.000Z" },
    ],
    [
      "today onward for a start date in the past",
      "from=2026-11-01",
      { $gte: TODAY },
    ],
  ])("limits the dates to %s", async (_, search, date) => {
    listed([]);

    await get(`/api/competitions?${search}`);

    expect(listFilter().date).toEqual(date);
  });

  it.each([
    ["open", "only competitions taking registrations", "OPEN"],
    ["any", "competitions whatever their registration status", undefined],
  ])("with registration=%s, keeps %s", async (registration, _, status) => {
    listed([]);

    await get(`/api/competitions?registration=${registration}`);

    expect(listFilter().registrationStatus).toBe(status);
  });

  it("pages through the results in a stable order", async () => {
    const results = listed([autumnOpen], { total: 12 });

    const response = await get("/api/competitions?page=3&limit=5");

    expect(response.body).toMatchObject({ total: 12, page: 3, limit: 5 });
    expect(results.sort).toHaveBeenCalledWith({ date: 1, name: 1, _id: 1 });
    expect(results.skip).toHaveBeenCalledWith(10);
    expect(results.limit).toHaveBeenCalledWith(5);
    expect(Competition.countDocuments).toHaveBeenCalledWith(
      Competition.find.mock.calls[0][0],
    );
  });

  it("treats filters sent empty as not chosen", async () => {
    listed([]);

    const response = await get(
      "/api/competitions?q=&gymId=&from=&to=&registration=",
    );

    expect(response.status).toBe(200);
    expect(listFilter()).toEqual({
      status: "PUBLISHED",
      gymId: { $in: [HOGTOWN_ID, NORTH_ID] },
      date: { $gte: TODAY },
    });
  });

  it.each([
    [
      "search text over 100 characters",
      `q=${"a".repeat(101)}`,
      "q",
      "Use 100 characters or fewer.",
    ],
    ["a malformed gym ID", "gymId=not-a-gym", "gymId", "Invalid gym id."],
    [
      "a date that doesn't exist",
      "from=2026-02-30",
      "from",
      "Enter a date like 2026-11-14.",
    ],
    [
      "an end date before the start date",
      "from=2026-12-10&to=2026-12-01",
      "to",
      "Choose an end date on or after the start date.",
    ],
    [
      "an unknown registration filter",
      "registration=closed",
      "registration",
      "Choose a registration filter: any, open.",
    ],
    ["page 0", "page=0", "page", "Page must be a whole number from 1."],
    ["a limit over 100", "limit=101", "limit", "Limit must be from 1 to 100."],
  ])(
    "rejects %s before reading competitions",
    async (_, search, field, message) => {
      listed([]);

      const response = await get(`/api/competitions?${search}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: "VALIDATION_ERROR",
        message: "Check the fields and try again.",
        fields: { [field]: message },
      });
      expect(Gym.find).not.toHaveBeenCalled();
      expect(Competition.find).not.toHaveBeenCalled();
    },
  );
});

describe("GET /api/competitions/filters (US-025)", () => {
  it("offers the active gyms with upcoming competitions, the registration choices and the saved location", async () => {
    vi.spyOn(Gym, "find").mockReturnValue(query([hogtown, junction, north]));
    vi.spyOn(Competition, "aggregate").mockResolvedValue([
      { _id: north._id, count: 2 },
      { _id: hogtown._id, count: 1 },
    ]);
    vi.spyOn(User, "findById").mockReturnValue(
      query({ location: { type: "Point", coordinates: [-79.3832, 43.6532] } }),
    );

    const response = await get("/api/competitions/filters");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      gyms: [
        { _id: HOGTOWN_ID, name: "Hogtown Boulders", competitionCount: 1 },
        { _id: NORTH_ID, name: "North Wall", competitionCount: 2 },
      ],
      registration: [
        { value: "any", label: "All upcoming competitions" },
        { value: "open", label: "Registration open" },
      ],
      maxRadiusKm: 200,
      hasSavedLocation: true,
    });
    expect(Gym.find.mock.calls[0][0]).toEqual({ status: "ACTIVE" });
    expect(Competition.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        status: "PUBLISHED",
        date: { $gte: new Date(TODAY) },
        gymId: { $in: [hogtown._id, junction._id, north._id] },
      },
    });
    expect(User.findById.mock.calls[0][0]).toBe(USER_ID);
  });

  it("offers no gyms when none is active, and says when the Climber saved no location", async () => {
    vi.spyOn(Gym, "find").mockReturnValue(query([]));
    const aggregate = vi.spyOn(Competition, "aggregate").mockResolvedValue([]);
    vi.spyOn(User, "findById").mockReturnValue(query({}));

    const response = await get("/api/competitions/filters");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ gyms: [], hasSavedLocation: false });
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe("GET /api/competitions/:competitionId (US-025, US-026)", () => {
  const activeGym = { ...north, status: "ACTIVE" };

  it.each([
    ["a draft", { ...published, status: "DRAFT" }, activeGym],
    [
      "a cancelled competition",
      { ...published, status: "CANCELLED" },
      activeGym,
    ],
    [
      "a competition of an inactive gym",
      published,
      { ...activeGym, status: "INACTIVE" },
    ],
    ["a competition that doesn't exist", null, activeGym],
  ])(
    "answers 404 COMPETITION_NOT_FOUND for %s",
    async (_, competition, gym) => {
      stored(competition, gym);

      const response = await get(`/api/competitions/${COMPETITION_ID}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
      expect(Registration.findOne).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["yesterday", false, "2026-11-13"],
    ["today", true, "2026-11-14"],
  ])(
    "opens a competition dated %s in Toronto with upcoming: %s",
    async (_, upcoming, day) => {
      stored(
        { ...published, date: new Date(`${day}T00:00:00.000Z`) },
        activeGym,
      );

      const response = await get(`/api/competitions/${COMPETITION_ID}`);

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({
        _id: COMPETITION_ID,
        name: "Autumn Open",
        date: day,
        gym: { _id: NORTH_ID, name: "North Wall" },
        upcoming,
        registrationAvailable: upcoming,
      });
      expect(Competition.findOne.mock.calls[0][0]).toEqual({
        _id: COMPETITION_ID,
        status: "PUBLISHED",
      });
      expect(Gym.findOne.mock.calls[0][0]).toEqual({
        _id: north._id,
        status: "ACTIVE",
      });
    },
  );
});
