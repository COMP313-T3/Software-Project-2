import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const OTHER_GYM_ID = "507f1f77bcf86cd799439014";
const AUTH = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";
const gyms = [
  { _id: GYM_ID, name: "North Gym", location: "Toronto" },
  { _id: OTHER_GYM_ID, name: "South Gym", location: "Ottawa" },
];

function app() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: "507f1f77bcf86cd799439013",
        role: "GYM_ADMIN",
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

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    skip: vi.fn(() => result),
    limit: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function listedCompetitions() {
  const competitions = query([{
    _id: "507f1f77bcf86cd799439012",
    gymId: GYM_ID,
    name: "Autumn Bouldering",
    date: new Date("2026-11-14T00:00:00.000Z"),
    location: "Toronto",
    status: "PUBLISHED",
    registrationStatus: "OPEN",
    capacity: 80,
  }]);
  vi.spyOn(Gym, "find").mockReturnValue(query(gyms));
  vi.spyOn(Competition, "find").mockReturnValue(competitions);
  vi.spyOn(Competition, "countDocuments").mockResolvedValue(1);
  return competitions;
}

afterEach(() => vi.restoreAllMocks());

describe("US-011 the Gym Admin's competition list", () => {
  it("lists the competitions of the Gym Admin's own gym when its ID is in capital letters", async () => {
    listedCompetitions();

    const response = await request(app())
      .get(`/api/gym-admin/competitions?period=all&gymId=${GYM_ID.toUpperCase()}`)
      .set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.competitions.map((competition) => competition.name)).toEqual(["Autumn Bouldering"]);
    const [filter] = vi.mocked(Competition.find).mock.calls[0];
    expect(filter.gymId.$in).toEqual([GYM_ID]);
  });

  it.each([
    ["upcoming", { date: 1, name: 1, _id: 1 }],
    ["past", { date: -1, name: 1, _id: 1 }],
    ["all", { date: -1, name: 1, _id: 1 }],
  ])("pages %s competitions in one order, with the ID breaking ties", async (period, sort) => {
    const competitions = listedCompetitions();

    const response = await request(app())
      .get(`/api/gym-admin/competitions?period=${period}&page=2&limit=5`)
      .set("Authorization", AUTH);

    expect(response.status).toBe(200);
    expect(competitions.sort).toHaveBeenCalledExactlyOnceWith(sort);
    expect(competitions.skip).toHaveBeenCalledExactlyOnceWith(5);
    expect(competitions.limit).toHaveBeenCalledExactlyOnceWith(5);
  });

  it("refuses a gym ID that isn't a MongoDB ID before reading competitions", async () => {
    listedCompetitions();

    const response = await request(app())
      .get("/api/gym-admin/competitions?gymId=not-a-gym")
      .set("Authorization", AUTH);

    expect(response.status).toBe(400);
    expect(response.body.fields.gymId).toBe("Invalid gym id.");
    expect(Competition.find).not.toHaveBeenCalled();
  });
});
