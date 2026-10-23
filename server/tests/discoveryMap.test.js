import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const COMPETITION_ID = "507f1f77bcf86cd799439012";
const AUTH = "Bearer test.test.test";
const gym = { _id: GYM_ID, name: "North Gym", location: "Toronto" };
const KEY = "maps-key-for-tests";
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };

const savedPin = {
  _id: COMPETITION_ID,
  gymId: GYM_ID,
  name: "Autumn Open",
  date: new Date("2026-11-14T00:00:00.000Z"),
  location: "Toronto",
  capacity: 80,
  registrationStatus: "OPEN",
  mapPoint: { type: "Point", coordinates: [-79.3832, 43.6532] },
};

const addressOnly = {
  ...savedPin,
  _id: "507f1f77bcf86cd799439016",
  name: "Harbour Jam",
  date: new Date("2026-11-21T00:00:00.000Z"),
  location: "1 Bathurst St, Toronto",
  mapPoint: undefined,
};

function googleAnswers(...results) {
  const fetchMock = vi.fn(async () => Response.json({ results }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function competitionsAre(competitions) {
  vi.spyOn(Gym, "find").mockReturnValue(query([gym]));
  vi.spyOn(Competition, "find").mockReturnValue(query(competitions));
  vi.spyOn(Competition, "countDocuments").mockResolvedValue(competitions.length);
  vi.spyOn(Registration, "aggregate").mockResolvedValue([]);
}

function mapOf(api) {
  return request(api).get("/api/competitions/map").set("Authorization", AUTH);
}

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    limit: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app(role = "CLIMBER", googleMapsServerKey = "") {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "507f1f77bcf86cd799439013",
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
  api.use(
    "/api/competitions",
    createCompetitionRoutes({ auth, googleMapsServerKey }),
  );
  api.use(errorHandler);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/competitions/map (US-027)", () => {
  it("returns only valid pins for published competitions at active gyms", async () => {
    const valid = {
      _id: COMPETITION_ID,
      gymId: GYM_ID,
      name: "Autumn Open",
      date: new Date("2026-11-14T00:00:00.000Z"),
      location: "Toronto",
      capacity: 80,
      registrationStatus: "OPEN",
      mapPoint: { type: "Point", coordinates: [-79.3832, 43.6532] },
    };
    const invalid = {
      ...valid,
      _id: "507f1f77bcf86cd799439014",
      name: "Invalid Pin",
      mapPoint: { type: "Point", coordinates: [181, 91] },
    };
    const unpinned = {
      ...valid,
      _id: "507f1f77bcf86cd799439015",
      name: "No Pin Yet",
      mapPoint: undefined,
    };
    vi.spyOn(Gym, "find").mockReturnValue(query([gym]));
    const findCompetitions = vi
      .spyOn(Competition, "find")
      .mockReturnValue(query([valid, invalid, unpinned]));
    vi.spyOn(Competition, "countDocuments").mockResolvedValue(3);
    vi.spyOn(Registration, "aggregate").mockResolvedValue([]);

    const response = await request(app())
      .get("/api/competitions/map")
      .set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      total: 3,
      unmapped: 2,
      truncated: false,
      pins: [
        {
          _id: COMPETITION_ID,
          name: "Autumn Open",
          location: "Toronto",
          coordinates: { lat: 43.6532, lng: -79.3832 },
        },
      ],
    });
    expect(Gym.find).toHaveBeenCalledWith({ status: "ACTIVE" }, "name location mapPoint");
    expect(findCompetitions).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PUBLISHED",
        gymId: expect.objectContaining({ $in: [GYM_ID] }),
      }),
      "gymId name date location registrationStatus capacity mapPoint",
    );
  });

  it("says when more competitions match than the map loads", async () => {
    vi.spyOn(Gym, "find").mockReturnValue(query([gym]));
    vi.spyOn(Competition, "find").mockReturnValue(query([savedPin]));
    vi.spyOn(Competition, "countDocuments").mockResolvedValue(600);
    vi.spyOn(Registration, "aggregate").mockResolvedValue([]);

    const response = await request(app())
      .get("/api/competitions/map")
      .set("Authorization", AUTH);

    expect(response.body).toMatchObject({ total: 600, unmapped: 0, truncated: true });
  });

  it("requires an authenticated Climber", async () => {
    const findGyms = vi.spyOn(Gym, "find");
    const response = await request(app("GYM_ADMIN"))
      .get("/api/competitions/map")
      .set("Authorization", AUTH);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_FORBIDDEN");
    expect(findGyms).not.toHaveBeenCalled();
  });
});

describe("GET /api/competitions/map pins from addresses (US-027)", () => {
  it("pins a competition without a saved pin where Google places its address", async () => {
    competitionsAre([savedPin, addressOnly]);
    const fetchMock = googleAnswers({
      location: { latitude: HOGTOWN.lat, longitude: HOGTOWN.lng },
      granularity: "ROOFTOP",
      types: ["street_address"],
    });
    const api = app("CLIMBER", KEY);

    const response = await mapOf(api);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      total: 2,
      unmapped: 0,
      truncated: false,
      pins: [
        { name: "Autumn Open", coordinates: { lat: 43.6532, lng: -79.3832 } },
        { name: "Harbour Jam", location: "1 Bathurst St, Toronto", coordinates: HOGTOWN },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/v4/geocode/address/1%20Bathurst%20St%2C%20Toronto?",
    );

    await mapOf(api);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a competition whose address is only a city off the map", async () => {
    competitionsAre([savedPin, { ...addressOnly, location: "Toronto" }]);
    googleAnswers({
      location: { latitude: 43.6532, longitude: -79.3832 },
      granularity: "APPROXIMATE",
      types: ["locality", "political"],
    });

    const response = await mapOf(app("CLIMBER", KEY));

    expect(response.body).toMatchObject({ total: 2, unmapped: 1 });
    expect(response.body.pins.map(({ name }) => name)).toEqual(["Autumn Open"]);
  });

  it("still answers with the saved pins when Google can't be reached", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    competitionsAre([savedPin, addressOnly]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await mapOf(app("CLIMBER", KEY));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 2, unmapped: 1 });
    expect(response.body.pins.map(({ name }) => name)).toEqual(["Autumn Open"]);
  });

  it("shows saved pins only without a Google Maps key", async () => {
    competitionsAre([savedPin, addressOnly]);
    const fetchMock = googleAnswers();

    const response = await mapOf(app());

    expect(response.body).toMatchObject({ total: 2, unmapped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
