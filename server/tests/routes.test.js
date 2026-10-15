import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Route } from "../src/models/Route.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

const COMPETITION_ID = "507f1f77bcf86cd799439011";
const OTHER_COMPETITION_ID = "507f1f77bcf86cd799439018";
const GYM_ID = "507f1f77bcf86cd799439012";
const ADMIN_ID = "507f1f77bcf86cd799439001";
const ROUTE_ID = "507f1f77bcf86cd799439021";
const AUTH = "Bearer header.payload.signature";
const objectId = (value) => new mongoose.Types.ObjectId(value);
const competition = {
  _id: objectId(COMPETITION_ID),
  gymId: objectId(GYM_ID),
};
const route = {
  _id: objectId(ROUTE_ID),
  competitionId: competition._id,
  routeNumber: "8",
  name: "Problem 8",
  grade: "V4",
  pointValue: 25,
  notes: "Overhang",
  official: true,
};

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

const endpoint = `/api/gym-admin/competitions/${COMPETITION_ID}/routes`;

function call(api, body, authenticate = true) {
  const test = request(api).post(endpoint);
  if (authenticate) test.set("Authorization", AUTH);
  return test.send(body);
}

beforeEach(() => {
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(Gym, "find").mockReturnValue(
    query([{ _id: objectId(GYM_ID), name: "North Gym", location: "Toronto" }]),
  );
  vi.spyOn(Competition.collection, "findOne").mockImplementation(async (filter) =>
    String(filter._id) === COMPETITION_ID &&
    filter.gymId.$in.some((id) => String(id) === GYM_ID)
      ? competition
      : null,
  );
  vi.spyOn(Route, "findOne").mockReturnValue(query(null));
  vi.spyOn(Route, "create").mockResolvedValue(new Route(route));
});

afterEach(() => vi.restoreAllMocks());

describe("US-016 route creation", () => {
  it("requires authentication before looking up gyms", async () => {
    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
    }, false);

    expect(response.status).toBe(401);
    expect(Gym.find).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "CLIMBER", "VISITOR"])(
    "refuses %s access",
    async (role) => {
      const response = await call(
        app(role),
        { routeNumber: "8", name: "Problem 8", grade: "V4" },
      );

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("ROLE_FORBIDDEN");
      expect(Gym.find).not.toHaveBeenCalled();
      expect(Route.create).not.toHaveBeenCalled();
    },
  );

  it("requires an active assigned gym", async () => {
    vi.mocked(Gym.find).mockReturnValue(query([]));

    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("NO_ASSIGNED_GYM");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });

  it("creates an official route linked to the managed competition", async () => {
    const response = await call(app(), {
      routeNumber: " 8 ",
      name: " Problem 8 ",
      grade: "V4",
      pointValue: 25,
      notes: " Overhang ",
      official: true,
      competitionId: OTHER_COMPETITION_ID,
      createdBy: "forged-admin",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      routeId: ROUTE_ID,
      competitionId: COMPETITION_ID,
      grade: "V4",
      official: true,
    });
    expect(Route.create).toHaveBeenCalledWith({
      competitionId: competition._id,
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
      pointValue: 25,
      notes: "Overhang",
      official: true,
    });
    expect(Route.findOne).toHaveBeenCalledWith(
      { competitionId: competition._id, routeNumber: "8" },
      "_id",
    );
    expect(Route.findOne.mock.results[0].value.collation).toHaveBeenCalledWith({
      locale: "en",
      strength: 2,
    });
  });

  it("allows point value and notes to be omitted", async () => {
    const response = await call(app(), {
      routeNumber: "9",
      name: "Problem 9",
      grade: "V0",
    });

    expect(response.status).toBe(201);
    expect(Route.create).toHaveBeenCalledWith({
      competitionId: competition._id,
      routeNumber: "9",
      name: "Problem 9",
      grade: "V0",
      official: true,
    });
  });

  it.each([
    [{ routeNumber: "8", name: "Problem 8", grade: "V-1" }, "grade"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4.5" }, "grade"],
    [{ routeNumber: "8", name: "Problem 8", grade: "4" }, "grade"],
    [{ routeNumber: " ", name: "Problem 8", grade: "V4" }, "routeNumber"],
    [{ routeNumber: "8", name: " ", grade: "V4" }, "name"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", pointValue: "25" }, "pointValue"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", official: false }, "official"],
  ])("rejects invalid route details before saving", async (body, field) => {
    const response = await call(app(), body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields[field]).toBeTypeOf("string");
    expect(Route.create).not.toHaveBeenCalled();
  });

  it("returns 404 for a competition outside the Gym Admin's gyms", async () => {
    vi.mocked(Competition.collection.findOne).mockResolvedValue(null);

    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Route.findOne).not.toHaveBeenCalled();
    expect(Route.create).not.toHaveBeenCalled();
  });

  it("rejects malformed competition IDs before looking up a competition", async () => {
    const response = await request(app())
      .post("/api/gym-admin/competitions/not-an-id/routes")
      .set("Authorization", AUTH)
      .send({ routeNumber: "8", name: "Problem 8", grade: "V4" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
  });

  it("rejects a route number already used in the competition", async () => {
    vi.mocked(Route.findOne).mockReturnValue(query(route));

    const response = await call(app(), {
      routeNumber: "8",
      name: "Another name",
      grade: "V4",
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("ROUTE_EXISTS");
    expect(Route.create).not.toHaveBeenCalled();
  });

  it("maps a concurrent duplicate route number to the same conflict", async () => {
    vi.mocked(Route.create).mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: 11000 }),
    );

    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("ROUTE_EXISTS");
  });

  it("does not expose unexpected database errors", async () => {
    vi.mocked(Route.create).mockRejectedValue(
      new Error("private database credentials"),
    );

    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
    });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(
      "private database credentials",
    );
  });

  it("enforces unique route numbers within each competition", () => {
    const routeNumberIndex = Route.schema
      .indexes()
      .find(([fields]) => fields.routeNumber === 1);

    expect(routeNumberIndex).toEqual([
      { competitionId: 1, routeNumber: 1 },
      { unique: true, collation: { locale: "en", strength: 2 } },
    ]);
  });
});
