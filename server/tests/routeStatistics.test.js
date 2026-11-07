import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { OfficialResult } from "../src/models/OfficialResult.js";
import { Route } from "../src/models/Route.js";
import { User } from "../src/models/User.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const USER_ID = "507f1f77bcf86cd799439012";
const COMPETITION_ID = "507f1f77bcf86cd799439013";
const ROUTE_ID = "507f1f77bcf86cd799439014";
const AUTH = "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.signature";
const STATISTICS_PATH = `/api/gym-admin/competitions/${COMPETITION_ID}/routes/${ROUTE_ID}/statistics`;

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app(role = "GYM_ADMIN") {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: USER_ID,
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

function authorizedGym() {
  vi.spyOn(User, "exists").mockResolvedValue({ _id: USER_ID });
  vi.spyOn(Gym, "find").mockReturnValue(query([{ _id: GYM_ID }]));
}

afterEach(() => vi.restoreAllMocks());

describe("US-022 route statistics API", () => {
  it("calculates all statistics from official results for the selected route and competition", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query({ _id: COMPETITION_ID, gymId: GYM_ID }),
    );
    vi.spyOn(Route, "findOne").mockReturnValue(
      query({ _id: ROUTE_ID, competitionId: COMPETITION_ID }),
    );
    const results = [
      { routeId: ROUTE_ID, climberId: USER_ID, attempts: 1, sends: 1, flash: true },
      { routeId: ROUTE_ID, climberId: USER_ID, attempts: 1, sends: 1, flash: true },
      { routeId: ROUTE_ID, climberId: USER_ID, attempts: 3, sends: 1, flash: false },
      { routeId: ROUTE_ID, climberId: USER_ID, attempts: 4, sends: 0, flash: false },
      { routeId: ROUTE_ID, climberId: USER_ID, attempts: 3, sends: 0, flash: false },
    ];
    const findResults = vi
      .spyOn(OfficialResult, "find")
      .mockReturnValue(query(results));

    const response = await request(app()).get(STATISTICS_PATH).set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.competitionId).toBe(COMPETITION_ID);
    expect(response.body.statistics).toEqual({
      routeId: ROUTE_ID,
      completionRate: 0.6,
      averageAttempts: 2.4,
      flashRate: 0.4,
      calculatedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(response.body.statistics.calculatedAt))).toBe(false);
    expect(findResults).toHaveBeenCalledWith(
      { competitionId: COMPETITION_ID, routeId: ROUTE_ID },
      "routeId climberId attempts sends flash officialScore",
    );
    const [competitionFilter] = Competition.findOne.mock.calls[0];
    expect(competitionFilter._id).toBe(COMPETITION_ID);
    expect(competitionFilter.gymId.$in).toEqual([GYM_ID]);
    expect(Route.findOne).toHaveBeenCalledWith({
      _id: ROUTE_ID,
      competitionId: COMPETITION_ID,
    });
  });

  it("returns null statistics when the route has no official results", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query({ _id: COMPETITION_ID, gymId: GYM_ID }),
    );
    vi.spyOn(Route, "findOne").mockReturnValue(
      query({ _id: ROUTE_ID, competitionId: COMPETITION_ID }),
    );
    vi.spyOn(OfficialResult, "find").mockReturnValue(query([]));

    const response = await request(app()).get(STATISTICS_PATH).set("Authorization", AUTH);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({
      competitionId: COMPETITION_ID,
      statistics: null,
    });
  });

  it("does not query results for a route outside the selected competition", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(
      query({ _id: COMPETITION_ID, gymId: GYM_ID }),
    );
    vi.spyOn(Route, "findOne").mockReturnValue(query(null));
    const findResults = vi.spyOn(OfficialResult, "find");

    const response = await request(app()).get(STATISTICS_PATH).set("Authorization", AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("ROUTE_NOT_FOUND");
    expect(findResults).not.toHaveBeenCalled();
    expect(Route.findOne).toHaveBeenCalledWith({
      _id: ROUTE_ID,
      competitionId: COMPETITION_ID,
    });
  });

  it("does not query routes or results for a competition outside the Gym Admin's gyms", async () => {
    authorizedGym();
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
    const findRoute = vi.spyOn(Route, "findOne");
    const findResults = vi.spyOn(OfficialResult, "find");

    const response = await request(app()).get(STATISTICS_PATH).set("Authorization", AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(findRoute).not.toHaveBeenCalled();
    expect(findResults).not.toHaveBeenCalled();
  });

  it("rejects malformed route identifiers before querying statistics", async () => {
    authorizedGym();
    const findCompetition = vi.spyOn(Competition, "findOne");
    const response = await request(app())
      .get(`/api/gym-admin/competitions/${COMPETITION_ID}/routes/invalid/statistics`)
      .set("Authorization", AUTH);

    expect(response.status).toBe(400);
    expect(findCompetition).not.toHaveBeenCalled();
  });
});
