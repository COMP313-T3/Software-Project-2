import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { User } from "../src/models/User.js";
import { DISCOVERY_ORDER_LIMIT } from "../src/constants/discovery.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import { distanceKm } from "../src/utils/geoPoints.js";
import "../src/config/database.js";

const AUTH = "Bearer test.test.test";
const HOME = { lat: 43.6532, lng: -79.3832 };
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };
const WOODBRIDGE = { lat: 43.7801, lng: -79.6012 };

const objectId = (hex) => new mongoose.Types.ObjectId(hex);

function point({ lat, lng }) {
  return { type: "Point", coordinates: [lng, lat] };
}

const nearGym = {
  _id: objectId("507f1f77bcf86cd799439011"),
  name: "Hogtown Bouldering",
  location: "1 Bathurst St, Toronto",
  mapPoint: point(HOGTOWN),
};
const farGym = {
  _id: objectId("507f1f77bcf86cd799439012"),
  name: "Woodbridge Rocks",
  location: "Vaughan",
  mapPoint: point(WOODBRIDGE),
};
const unpinnedGym = {
  _id: objectId("507f1f77bcf86cd799439021"),
  name: "Lakeshore Boulders",
  location: "Mississauga",
};

let nextId = 1;

/** A competition with a fixed ID, so the shuffled orders are the same on every run. */
function competition(gym, overrides = {}) {
  const id = objectId(`6a0000000000000000${String(nextId++).padStart(6, "0")}`);
  return {
    _id: id,
    gymId: gym._id,
    name: `Competition ${id}`,
    date: new Date("2100-11-14T00:00:00.000Z"),
    location: gym.location,
    capacity: 80,
    registrationStatus: "OPEN",
    ...overrides,
  };
}

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    skip: vi.fn(() => result),
    limit: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

/** Answers the gym queries the way MongoDB would, every active gym, without a distance filter. */
function gymsAre(gyms) {
  vi.spyOn(Gym.collection, "find").mockImplementation(async () => ({
    toArray: async () => gyms,
  }));
}

/**
 * Answers the competition and registration reads. joined maps a competition to its CONFIRMED
 * registrations, and the registration count only answers for the competitions it's asked about.
 */
function competitionsAre(competitions, joined = new Map()) {
  const results = query(competitions);
  vi.spyOn(Competition, "find").mockReturnValue(results);
  vi.spyOn(Competition, "countDocuments").mockResolvedValue(competitions.length);
  vi.spyOn(Registration, "aggregate").mockImplementation(async ([{ $match }]) =>
    $match.competitionId.$in
      .filter((id) => joined.has(id))
      .map((id) => ({ _id: id, count: joined.get(id) })),
  );
  return results;
}

function savedLocationIs(location) {
  return vi
    .spyOn(User, "findById")
    .mockReturnValue(query(location ? { location: point(location) } : {}));
}

function app() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "507f1f77bcf86cd799439013",
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
  api.use("/api/competitions", createCompetitionRoutes({ auth, googleMapsServerKey: "" }));
  api.use(errorHandler);
  return api;
}

function get(path) {
  return request(app()).get(path).set("Authorization", AUTH);
}

const names = (response) => response.body.competitions.map(({ name }) => name);
const ids = (response) => response.body.competitions.map(({ _id }) => _id);
const fromHome = `lat=${HOME.lat}&lng=${HOME.lng}`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/competitions order (US-026 criterion 6)", () => {
  it("keeps soonest first as the database's order, one page at a time", async () => {
    gymsAre([nearGym]);
    const results = competitionsAre([competition(nearGym)]);

    const response = await get("/api/competitions?sort=soonest&page=2&limit=5");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(results.sort).toHaveBeenCalledWith({ date: 1, name: 1, _id: 1 });
    expect(results.skip).toHaveBeenCalledWith(5);
    expect(results.limit).toHaveBeenCalledWith(5);
  });

  it("puts the closest first, measured to each gym's pin, with gyms without a pin last", async () => {
    gymsAre([nearGym, farGym, unpinnedGym]);
    const results = competitionsAre([
      competition(unpinnedGym, { name: "Lakeshore Jam", date: new Date("2100-11-01T00:00:00Z") }),
      competition(farGym, { name: "Woodbridge Open", date: new Date("2100-11-02T00:00:00Z") }),
      competition(nearGym, { name: "Hogtown Open", date: new Date("2100-12-20T00:00:00Z") }),
    ]);

    const response = await get(`/api/competitions?${fromHome}&sort=closest`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.competitions).toMatchObject([
      { name: "Hogtown Open", distanceKm: distanceKm(HOME, HOGTOWN) },
      { name: "Woodbridge Open", distanceKm: distanceKm(HOME, WOODBRIDGE) },
      { name: "Lakeshore Jam", distanceKm: null },
    ]);
    expect(results.skip).not.toHaveBeenCalled();
  });

  it("puts the competitions of every gym without a pin last, soonest first among them", async () => {
    const junction = {
      _id: objectId("507f1f77bcf86cd799439022"),
      name: "Junction Walls",
      location: "Etobicoke",
    };
    gymsAre([nearGym, unpinnedGym, junction]);
    competitionsAre([
      competition(junction, { name: "Junction Late", date: new Date("2100-12-05T00:00:00Z") }),
      competition(unpinnedGym, { name: "Lakeshore Early", date: new Date("2100-11-03T00:00:00Z") }),
      competition(nearGym, { name: "Hogtown Open", date: new Date("2100-12-20T00:00:00Z") }),
      competition(junction, { name: "Junction Early", date: new Date("2100-11-03T00:00:00Z") }),
    ]);

    const response = await get(`/api/competitions?${fromHome}&sort=closest`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(names(response)).toEqual(["Hogtown Open", "Junction Early", "Lakeshore Early", "Junction Late"]);
    expect(response.body.competitions.slice(1).map(({ distanceKm }) => distanceKm)).toEqual([null, null, null]);
  });

  it.each([
    ["closest", `${fromHome}&sort=closest`],
    ["joined", "sort=joined"],
    ["spaces", "sort=spaces"],
    ["random", "sort=random&seed=42"],
  ])("ranks at most the soonest matches for %s, and counts the ranked ones", async (_, search) => {
    gymsAre([nearGym]);
    const results = competitionsAre(Array.from({ length: 3 }, () => competition(nearGym)));

    const response = await get(`/api/competitions?${search}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(results.sort).toHaveBeenCalledWith({ date: 1, name: 1, _id: 1 });
    expect(results.limit).toHaveBeenCalledWith(DISCOVERY_ORDER_LIMIT);
    expect(DISCOVERY_ORDER_LIMIT).toBe(1000);
    expect(Competition.countDocuments).not.toHaveBeenCalled();
    expect(response.body.total).toBe(3);
  });

  it("puts competitions at the same distance soonest first", async () => {
    gymsAre([nearGym]);
    competitionsAre([
      competition(nearGym, { name: "Later", date: new Date("2100-12-01T00:00:00Z") }),
      competition(nearGym, { name: "Sooner", date: new Date("2100-11-01T00:00:00Z") }),
    ]);

    const response = await get(`/api/competitions?${fromHome}&sort=closest`);

    expect(names(response)).toEqual(["Sooner", "Later"]);
  });

  it("measures closest first from the saved location when the Climber sends no point", async () => {
    const savedLocation = savedLocationIs(WOODBRIDGE);
    gymsAre([nearGym, farGym]);
    competitionsAre([
      competition(nearGym, { name: "Hogtown Open" }),
      competition(farGym, { name: "Woodbridge Open" }),
    ]);

    const response = await get("/api/competitions?sort=closest");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(savedLocation).toHaveBeenCalledOnce();
    expect(names(response)).toEqual(["Woodbridge Open", "Hogtown Open"]);
    expect(response.body.competitions[0].distanceKm).toBe(0);
  });

  it("asks for a starting point to sort by distance when there's none", async () => {
    savedLocationIs(null);
    gymsAre([nearGym]);
    competitionsAre([competition(nearGym)]);

    const response = await get("/api/competitions?sort=closest");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "VALIDATION_ERROR",
      fields: { sort: "Choose a starting point to sort by distance." },
    });
  });

  it("puts the most joined first, counting CONFIRMED registrations, and says how many joined", async () => {
    gymsAre([nearGym]);
    const few = competition(nearGym, { name: "Few" });
    const most = competition(nearGym, { name: "Most" });
    const none = competition(nearGym, { name: "None", date: new Date("2100-10-01T00:00:00Z") });
    competitionsAre([few, most, none], new Map([[few._id, 5], [most._id, 12]]));

    const response = await get("/api/competitions?sort=joined");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.competitions).toMatchObject([
      { name: "Most", joined: 12, spacesLeft: 68 },
      { name: "Few", joined: 5, spacesLeft: 75 },
      { name: "None", joined: 0, spacesLeft: 80 },
    ]);
    expect(Registration.aggregate).toHaveBeenCalledOnce();
    expect(Registration.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        competitionId: { $in: [few._id, most._id, none._id] },
        status: "CONFIRMED",
      },
    });
  });

  it("puts the most spaces left first, and full competitions last", async () => {
    gymsAre([nearGym]);
    const roomy = competition(nearGym, { name: "Roomy", capacity: 100 });
    const small = competition(nearGym, { name: "Small", capacity: 20 });
    const full = competition(nearGym, { name: "Full", capacity: 10 });
    competitionsAre([full, small, roomy], new Map([[roomy._id, 30], [full._id, 10]]));

    const response = await get("/api/competitions?sort=spaces");

    expect(response.body.competitions).toMatchObject([
      { name: "Roomy", spacesLeft: 70 },
      { name: "Small", spacesLeft: 20 },
      { name: "Full", spacesLeft: 0, full: true },
    ]);
  });

  it("shuffles the same way for the same seed, so the pages fit together", async () => {
    gymsAre([nearGym]);
    const all = Array.from({ length: 25 }, (_, index) =>
      competition(nearGym, { date: new Date(Date.UTC(2100, 10, 1 + index)) }),
    );
    competitionsAre(all);

    const pages = [];
    for (const page of [1, 2, 3]) {
      const response = await get(`/api/competitions?sort=random&seed=12345&page=${page}&limit=10`);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({ total: 25, page, limit: 10 });
      pages.push(ids(response));
    }
    const shuffled = pages.flat();
    expect(new Set(shuffled).size).toBe(25);
    expect(shuffled.toSorted()).toEqual(all.map(({ _id }) => String(_id)).toSorted());
    expect(shuffled).not.toEqual(all.map(({ _id }) => String(_id)));

    const again = await get("/api/competitions?sort=random&seed=12345&limit=10");
    expect(ids(again)).toEqual(pages[0]);
    const another = await get("/api/competitions?sort=random&seed=777&limit=10");
    expect(ids(another)).not.toEqual(pages[0]);
  });

  it("keeps one random order all day when no seed is sent", async () => {
    gymsAre([nearGym]);
    competitionsAre(Array.from({ length: 12 }, () => competition(nearGym)));

    const first = await get("/api/competitions?sort=random");
    const second = await get("/api/competitions?sort=random");

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(ids(second)).toEqual(ids(first));
  });

  it("shuffles by the date in Toronto when no seed is sent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T03:30:00Z"));
    gymsAre([nearGym]);
    competitionsAre(Array.from({ length: 12 }, () => competition(nearGym)));

    const daily = await get("/api/competitions?sort=random");
    const toronto = await get("/api/competitions?sort=random&seed=20261119");
    const utc = await get("/api/competitions?sort=random&seed=20261120");

    expect(daily.status, JSON.stringify(daily.body)).toBe(200);
    expect(ids(daily)).toEqual(ids(toronto));
    expect(ids(daily)).not.toEqual(ids(utc));
  });

  it("pages through a chosen order with the full total", async () => {
    gymsAre([nearGym]);
    competitionsAre(Array.from({ length: 7 }, () => competition(nearGym)));

    const last = await get("/api/competitions?sort=joined&page=2&limit=5");
    const past = await get("/api/competitions?sort=joined&page=3&limit=5");

    expect(last.body).toMatchObject({ total: 7, page: 2, limit: 5 });
    expect(last.body.competitions).toHaveLength(2);
    expect(past.body).toMatchObject({ competitions: [], total: 7, page: 3 });
  });

  it.each([
    ["an order it doesn't offer", "sort=nearest", "sort", "Choose an order: soonest, closest, joined, spaces, random."],
    ["a shuffle number of 0", "sort=random&seed=0", "seed", "Use a shuffle number from 1 to 999999999."],
    ["a shuffle number too large", "sort=random&seed=1000000000", "seed", "Use a shuffle number from 1 to 999999999."],
    ["a shuffle number that isn't a number", "sort=random&seed=abc", "seed", "Use a shuffle number from 1 to 999999999."],
  ])("refuses %s before reading competitions", async (_, search, field, message) => {
    gymsAre([nearGym]);
    competitionsAre([]);

    const response = await get(`/api/competitions?${search}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: "VALIDATION_ERROR", fields: { [field]: message } });
    expect(Competition.find).not.toHaveBeenCalled();
  });
});

describe("starting point (US-025 criterion 6)", () => {
  it("shows distances from the saved location when the Climber starts there", async () => {
    savedLocationIs(HOME);
    gymsAre([nearGym, unpinnedGym]);
    competitionsAre([
      competition(nearGym, { name: "Hogtown Open" }),
      competition(unpinnedGym, { name: "Lakeshore Jam" }),
    ]);

    const response = await get("/api/competitions?near=saved");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.competitions).toMatchObject([
      { name: "Hogtown Open", distanceKm: distanceKm(HOME, HOGTOWN) },
      { name: "Lakeshore Jam", distanceKm: null },
    ]);
  });

  it("leaves distances out without a starting point, even with a saved location", async () => {
    const savedLocation = savedLocationIs(HOME);
    gymsAre([nearGym]);
    competitionsAre([competition(nearGym)]);

    const response = await get("/api/competitions");

    expect(response.body.competitions[0]).not.toHaveProperty("distanceKm");
    expect(savedLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["near=saved", "near", "Your account doesn't have a saved location. Choose another starting point."],
    ["radiusKm=10", "radiusKm", "Choose a starting point to search by distance."],
  ])("with %s, asks for a starting point when the Climber has no saved location", async (search, field, message) => {
    savedLocationIs(null);
    gymsAre([nearGym]);
    competitionsAre([]);

    const response = await get(`/api/competitions?${search}`);

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ [field]: message });
  });

  it.each([
    ["the saved location and a point together", `near=saved&${fromHome}`, "Choose one starting point: your saved location or a point."],
    ["a starting point it doesn't know", "near=home", "Choose a starting point."],
  ])("refuses %s", async (_, search, message) => {
    const savedLocation = savedLocationIs(HOME);
    gymsAre([nearGym]);
    competitionsAre([]);

    const response = await get(`/api/competitions?${search}`);

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ near: message });
    expect(savedLocation).not.toHaveBeenCalled();
  });
});

describe("GET /api/competitions/map starting point (US-027 criterion 7)", () => {
  it("answers the point it measured from, and keeps the pins soonest first whatever the order", async () => {
    gymsAre([nearGym]);
    const results = competitionsAre([competition(nearGym)]);

    const response = await get(`/api/competitions/map?${fromHome}&sort=random&seed=5`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.origin).toEqual(HOME);
    expect(results.sort).toHaveBeenCalledWith({ date: 1, name: 1, _id: 1 });
  });

  it("answers the saved location when the Climber starts there", async () => {
    savedLocationIs(WOODBRIDGE);
    gymsAre([nearGym]);
    competitionsAre([competition(nearGym)]);

    const response = await get("/api/competitions/map?near=saved&radiusKm=25");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.origin).toEqual(WOODBRIDGE);
  });

  it("answers no starting point when there's none", async () => {
    gymsAre([nearGym]);
    competitionsAre([competition(nearGym)]);

    const response = await get("/api/competitions/map");

    expect(response.body.origin).toBeNull();
  });
});

describe("browser caching of discovery answers (US-025 criterion 6)", () => {
  it.each([
    ["the list from a point", `/api/competitions?${fromHome}&sort=closest`],
    ["the map from a point", `/api/competitions/map?${fromHome}`],
    ["the filter choices", "/api/competitions/filters"],
  ])("tells browsers not to keep %s", async (_, path) => {
    vi.spyOn(Gym, "find").mockReturnValue(query([]));
    savedLocationIs(null);
    gymsAre([nearGym]);
    competitionsAre([competition(nearGym)]);

    const response = await get(path);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("tells browsers not to keep a refusal either", async () => {
    const response = await request(app()).get(`/api/competitions?${fromHome}`);

    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});

describe("GET /api/competitions/filters orders and distances (US-025, US-026)", () => {
  it("offers the orders and the distances the Discover page shows", async () => {
    vi.spyOn(Gym, "find").mockReturnValue(query([]));
    savedLocationIs(null);

    const response = await get("/api/competitions/filters");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      sorts: [
        { value: "soonest", label: "Soonest first" },
        { value: "closest", label: "Closest first" },
        { value: "joined", label: "Most joined" },
        { value: "spaces", label: "Most spaces left" },
        { value: "random", label: "Random order" },
      ],
      distanceChoicesKm: [5, 10, 25, 50, 100],
      maxRadiusKm: 200,
    });
  });
});
