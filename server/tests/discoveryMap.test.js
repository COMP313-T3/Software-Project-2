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

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    limit: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app(role = "CLIMBER") {
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
  api.use("/api/competitions", createCompetitionRoutes({ auth }));
  api.use(errorHandler);
  return api;
}

afterEach(() => vi.restoreAllMocks());

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
    vi.spyOn(Gym, "find").mockReturnValue(query([gym]));
    const findCompetitions = vi
      .spyOn(Competition, "find")
      .mockReturnValue(query([valid, invalid]));
    vi.spyOn(Competition, "countDocuments").mockImplementation(async (filter) =>
      filter.mapPoint ? 2 : 3,
    );
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
    expect(Gym.find).toHaveBeenCalledWith({ status: "ACTIVE" }, "name location");
    expect(findCompetitions).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PUBLISHED",
        gymId: expect.objectContaining({ $in: [GYM_ID] }),
        mapPoint: expect.objectContaining({ $exists: true }),
      }),
      "gymId name date location registrationStatus capacity mapPoint",
    );
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
