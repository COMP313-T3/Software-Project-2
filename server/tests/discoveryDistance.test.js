import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Division } from "../src/models/Division.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { User } from "../src/models/User.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";
import { distanceKm, EARTH_RADIUS_KM } from "../src/utils/geoPoints.js";
import "../src/config/database.js";

const AUTH = "Bearer test.test.test";
const KEY = "maps-key-for-tests";
const HOME = { lat: 43.6532, lng: -79.3832 };
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };
const SEEDED = { lat: 43.7001, lng: -79.5012 };
const DUNDAS = { lat: 43.6655, lng: -79.4646 };

function point({ lat, lng }) {
  return { type: "Point", coordinates: [lng, lat] };
}

const pinnedGym = {
  _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
  name: "Hogtown Bouldering",
  location: "1 Bathurst St, Toronto",
  mapPoint: point(HOGTOWN),
};
const unpinnedGym = {
  _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439021"),
  name: "Lakeshore Boulders",
  location: "Mississauga",
};
const inactiveGymId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439031");

function competition(gym, overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    gymId: gym._id,
    name: "Autumn Open",
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
    collation: vi.fn(() => result),
    populate: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

/**
 * Answers the gym queries the way MongoDB would: every active gym, or only those near the point
 * for a distance filter. Only the database is stubbed, so Mongoose casts and sanitizes the
 * queries as it does when running.
 */
function gymsAre(active, near = []) {
  return vi.spyOn(Gym.collection, "find").mockImplementation(async (filter) => ({
    toArray: async () => (filter.mapPoint ? near : active),
  }));
}

function nearQueryOf(find) {
  return find.mock.calls.map(([filter]) => filter).find((filter) => filter.mapPoint);
}

function competitionsAre(competitions) {
  const find = vi.spyOn(Competition, "find").mockReturnValue(query(competitions));
  vi.spyOn(Competition, "countDocuments").mockResolvedValue(competitions.length);
  vi.spyOn(Registration, "aggregate").mockResolvedValue([]);
  return find;
}

function savedLocationIs(location) {
  return vi.spyOn(User, "findById").mockReturnValue(query({ location: point(location) }));
}

function googlePlaces(location) {
  const fetchMock = vi.fn(async () =>
    Response.json({
      results: [
        {
          location: { latitude: location.lat, longitude: location.lng },
          granularity: "ROOFTOP",
          types: ["street_address"],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function app(googleMapsServerKey = "") {
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
  api.use("/api/competitions", createCompetitionRoutes({ auth, googleMapsServerKey }));
  api.use(errorHandler);
  return api;
}

function get(api, path) {
  return request(api).get(path).set("Authorization", AUTH);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("distance search from gym pins (US-025)", () => {
  it("keeps only the competitions of active gyms pinned within the distance", async () => {
    savedLocationIs(HOME);
    const findGyms = gymsAre([pinnedGym, unpinnedGym], [pinnedGym, { _id: inactiveGymId }]);
    const findCompetitions = competitionsAre([competition(pinnedGym)]);

    const response = await get(app(), "/api/competitions?radiusKm=10");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(nearQueryOf(findGyms)).toMatchObject({
      status: "ACTIVE",
      mapPoint: {
        $geoWithin: { $centerSphere: [[HOME.lng, HOME.lat], 10 / EARTH_RADIUS_KM] },
      },
    });
    const [filter] = findCompetitions.mock.calls[0];
    expect(filter.gymId.$in.map(String)).toEqual([String(pinnedGym._id)]);
    expect(filter).not.toHaveProperty("mapPoint");
  });

  it("measures from the point the Climber chose on the map", async () => {
    const savedLocation = savedLocationIs(HOME);
    const findGyms = gymsAre([pinnedGym], [pinnedGym]);
    competitionsAre([]);

    const response = await get(
      app(),
      `/api/competitions/map?lat=${HOGTOWN.lat}&lng=${HOGTOWN.lng}&radiusKm=5`,
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(nearQueryOf(findGyms).mapPoint.$geoWithin.$centerSphere).toEqual([
      [HOGTOWN.lng, HOGTOWN.lat],
      5 / EARTH_RADIUS_KM,
    ]);
    expect(savedLocation).not.toHaveBeenCalled();
  });

  it("finds nothing when no gym is pinned within the distance", async () => {
    savedLocationIs(HOME);
    gymsAre([pinnedGym, unpinnedGym], []);
    const findCompetitions = competitionsAre([]);

    const response = await get(app(), "/api/competitions?radiusKm=1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ competitions: [], total: 0 });
    expect(findCompetitions.mock.calls[0][0].gymId.$in).toEqual([]);
  });

  it("includes gyms without a pin when there's no distance filter", async () => {
    const findGyms = gymsAre([pinnedGym, unpinnedGym]);
    const findCompetitions = competitionsAre([]);

    await get(app(), "/api/competitions");

    expect(nearQueryOf(findGyms)).toBeUndefined();
    expect(findCompetitions.mock.calls[0][0].gymId.$in.map(String)).toEqual([
      String(pinnedGym._id),
      String(unpinnedGym._id),
    ]);
  });

  it("gives each competition's distance to its gym's pin", async () => {
    gymsAre([pinnedGym, unpinnedGym]);
    competitionsAre([
      competition(pinnedGym, { name: "Hogtown Open", mapPoint: point(SEEDED) }),
      competition(unpinnedGym, { name: "Lakeshore Jam", mapPoint: point(SEEDED) }),
    ]);

    const response = await get(app(), `/api/competitions?lat=${HOME.lat}&lng=${HOME.lng}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.competitions).toMatchObject([
      { name: "Hogtown Open", coordinates: HOGTOWN, distanceKm: distanceKm(HOME, HOGTOWN) },
      { name: "Lakeshore Jam", coordinates: SEEDED, distanceKm: null },
    ]);
  });
});

describe("GET /api/competitions/map pins from the gym (US-027)", () => {
  it("pins a competition at its gym's pin, else its own pin, else its address", async () => {
    gymsAre([pinnedGym, unpinnedGym]);
    competitionsAre([
      competition(pinnedGym, { name: "Hogtown Open", mapPoint: point(SEEDED) }),
      competition(unpinnedGym, { name: "Seeded Jam", mapPoint: point(SEEDED) }),
      competition(unpinnedGym, { name: "Dundas Jam", location: "2700 Dundas St W, Toronto" }),
    ]);
    const fetchMock = googlePlaces(DUNDAS);

    const response = await get(app(KEY), "/api/competitions/map");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ total: 3, unmapped: 0, pending: 0 });
    expect(response.body.pins.map(({ name, coordinates }) => ({ name, coordinates }))).toEqual([
      { name: "Hogtown Open", coordinates: HOGTOWN },
      { name: "Seeded Jam", coordinates: SEEDED },
      { name: "Dundas Jam", coordinates: DUNDAS },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("2700%20Dundas%20St%20W");
  });

  it("counts the competitions whose address isn't looked up yet apart, and pins them next time", async () => {
    gymsAre([unpinnedGym]);
    competitionsAre(
      Array.from({ length: 22 }, (_, index) =>
        competition(unpinnedGym, {
          name: `Queen Street Jam ${index + 1}`,
          location: `${index + 1} Queen St W, Toronto`,
        }),
      ),
    );
    googlePlaces(DUNDAS);
    const api = app(KEY);

    const first = await get(api, "/api/competitions/map");

    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ total: 22, unmapped: 0, pending: 2 });
    expect(first.body.pins).toHaveLength(20);

    const refreshed = await get(api, "/api/competitions/map");

    expect(refreshed.body).toMatchObject({ total: 22, unmapped: 0, pending: 0 });
    expect(refreshed.body.pins).toHaveLength(22);
  });
});

describe("GET /api/competitions/:competitionId pin (US-025)", () => {
  function eventAt(gym, event) {
    vi.spyOn(Competition, "findOne").mockReturnValue(query({ ...event, status: "PUBLISHED" }));
    const findGym = vi.spyOn(Gym, "findOne").mockReturnValue(query({ ...gym, status: "ACTIVE" }));
    vi.spyOn(Division, "find").mockReturnValue(query([]));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
    vi.spyOn(Registration, "findOne").mockReturnValue(query(null));
    return findGym;
  }

  it.each([
    ["its gym's pin", pinnedGym, HOGTOWN],
    ["its own pin when the gym has none", unpinnedGym, SEEDED],
  ])("shows %s", async (_, gym, coordinates) => {
    const event = competition(gym, { mapPoint: point(SEEDED) });
    const findGym = eventAt(gym, event);

    const response = await get(app(), `/api/competitions/${event._id}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.coordinates).toEqual(coordinates);
    expect(findGym).toHaveBeenCalledWith(
      { _id: gym._id, status: "ACTIVE" },
      "name location mapPoint",
    );
  });
});
