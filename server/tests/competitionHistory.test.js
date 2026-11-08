import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { OfficialResult } from "../src/models/OfficialResult.js";
import { Registration } from "../src/models/Registration.js";
import { Route } from "../src/models/Route.js";
import { User } from "../src/models/User.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const OTHER_GYM_ID = "507f1f77bcf86cd799439012";
const USER_ID = "507f1f77bcf86cd799439013";
const COMPETITION_ID = "507f1f77bcf86cd799439014";
const ROUTE_ID = "507f1f77bcf86cd799439015";
const CLIMBER_ID = "507f1f77bcf86cd799439016";
const DIVISION_ID = "507f1f77bcf86cd799439017";
const AUTH = "******";
const RESULTS_PATH = `/api/gym-admin/competitions/${COMPETITION_ID}/results`;

function query(value) {
  const result = {
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

function authorizedGym() {
  vi.spyOn(User, "exists").mockResolvedValue({ _id: USER_ID });
  vi.spyOn(Gym, "find").mockReturnValue(query([{ _id: GYM_ID, name: "North Gym" }]));
}

afterEach(() => vi.restoreAllMocks());

describe("US-024 competition history results API", () => {
  it("returns saved results and associates them with routes from the selected competition", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query({ _id: COMPETITION_ID, gymId: GYM_ID, status: "PUBLISHED" }),
    );
    const result = {
      _id: "507f1f77bcf86cd799439018",
      competitionId: COMPETITION_ID,
      climberId: CLIMBER_ID,
      routeId: ROUTE_ID,
      attempts: 2,
      sends: 1,
      flash: false,
      officialScore: 80,
    };
    vi.spyOn(OfficialResult, "find").mockReturnValue(query([result]));
    vi.spyOn(OfficialResult, "countDocuments").mockResolvedValue(1);
    vi.spyOn(User, "find").mockReturnValue(
      query([{ _id: CLIMBER_ID, firstName: "Alex", lastName: "Climber" }]),
    );
    vi.spyOn(Route, "find").mockReturnValue(
      query([{ _id: ROUTE_ID, routeNumber: "1", name: "Blue Slab", grade: "V4", pointValue: 80 }]),
    );
    vi.spyOn(Registration, "find").mockReturnValue(
      query([{ climberId: CLIMBER_ID, divisionId: { _id: DIVISION_ID, name: "Open" } }]),
    );

    const response = await request(app()).get(RESULTS_PATH).set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      results: [
        {
          competitionId: COMPETITION_ID,
          routeId: ROUTE_ID,
          officialScore: 80,
          route: { _id: ROUTE_ID, name: "Blue Slab" },
          climber: { _id: CLIMBER_ID, firstName: "Alex" },
        },
      ],
    });
    expect(OfficialResult.find).toHaveBeenCalledWith(
      { competitionId: COMPETITION_ID },
      expect.anything(),
    );
    expect(Route.find).toHaveBeenCalledWith(
      {
        _id: expect.anything(),
        competitionId: COMPETITION_ID,
      },
      "routeNumber name grade pointValue",
    );
  });

  it("returns an empty result list when a competition has no saved history", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query({ _id: COMPETITION_ID, gymId: GYM_ID, status: "PUBLISHED" }),
    );
    vi.spyOn(OfficialResult, "find").mockReturnValue(query([]));
    vi.spyOn(OfficialResult, "countDocuments").mockResolvedValue(0);
    vi.spyOn(User, "find").mockReturnValue(query([]));
    vi.spyOn(Route, "find").mockReturnValue(query([]));
    vi.spyOn(Registration, "find").mockReturnValue(query([]));

    const response = await request(app()).get(RESULTS_PATH).set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({
      results: [],
      total: 0,
      page: 1,
    });
  });

  it("does not return or query results for another gym's competition", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
    const findResults = vi.spyOn(OfficialResult, "find");
    const findRoutes = vi.spyOn(Route, "find");

    const response = await request(app()).get(RESULTS_PATH).set("Authorization", AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(findResults).not.toHaveBeenCalled();
    expect(findRoutes).not.toHaveBeenCalled();
    const [filter] = Competition.findOne.mock.calls[0];
    expect(filter.gymId.$in).toEqual([GYM_ID]);
    expect(filter.gymId.$in).not.toContain(OTHER_GYM_ID);
  });
});
