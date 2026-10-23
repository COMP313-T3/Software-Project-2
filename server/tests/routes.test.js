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
const routeEndpoint = `${endpoint}/${ROUTE_ID}`;

function call(api, body, authenticate = true) {
  const test = request(api).post(endpoint);
  if (authenticate) test.set("Authorization", AUTH);
  return test.send(body);
}

function callRoute(api, method, body, authenticate = true) {
  const test = request(api)[method](routeEndpoint);
  if (authenticate) test.set("Authorization", AUTH);
  return body === undefined ? test : test.send(body);
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
  vi.spyOn(Route, "findOneAndUpdate").mockReturnValue(query(null));
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
});

describe("US-016 and US-017 route list", () => {
  const SECOND_ROUTE_ID = "507f1f77bcf86cd799439022";

  function list(api, authenticate = true) {
    const test = request(api).get(endpoint);
    return authenticate ? test.set("Authorization", AUTH) : test;
  }

  it("requires authentication before looking up gyms", async () => {
    vi.spyOn(Route, "find");

    const response = await list(app(), false);

    expect(response.status).toBe(401);
    expect(Gym.find).not.toHaveBeenCalled();
    expect(Route.find).not.toHaveBeenCalled();
  });

  it("lists only the selected competition's routes, by route number", async () => {
    const second = {
      ...route,
      _id: objectId(SECOND_ROUTE_ID),
      routeNumber: "10",
      name: undefined,
      grade: "V6",
      pointValue: undefined,
      notes: undefined,
    };
    vi.spyOn(Route, "find").mockReturnValue(query([route, second]));

    const response = await list(app());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      routes: [
        {
          routeId: ROUTE_ID,
          competitionId: COMPETITION_ID,
          routeNumber: "8",
          name: "Problem 8",
          grade: "V4",
          pointValue: 25,
          notes: "Overhang",
          official: true,
        },
        {
          routeId: SECOND_ROUTE_ID,
          competitionId: COMPETITION_ID,
          routeNumber: "10",
          grade: "V6",
          official: true,
        },
      ],
      total: 2,
    });
    expect(Route.find).toHaveBeenCalledWith({ competitionId: competition._id });
    const chain = Route.find.mock.results[0].value;
    expect(chain.collation).toHaveBeenCalledWith({
      locale: "en",
      strength: 2,
      numericOrdering: true,
    });
    expect(chain.sort).toHaveBeenCalledWith({ routeNumber: 1, _id: 1 });
  });

  it("answers an empty list for a competition without routes", async () => {
    vi.spyOn(Route, "find").mockReturnValue(query([]));

    const response = await list(app());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ routes: [], total: 0 });
  });

  it("returns 404 for another gym's competition without reading its routes", async () => {
    vi.mocked(Competition.collection.findOne).mockResolvedValue(null);
    vi.spyOn(Route, "find");

    const response = await list(app());

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
    expect(Route.find).not.toHaveBeenCalled();
  });

  it("rejects malformed competition IDs before looking up a competition", async () => {
    vi.spyOn(Route, "find");

    const response = await request(app())
      .get("/api/gym-admin/competitions/not-an-id/routes")
      .set("Authorization", AUTH);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(Competition.collection.findOne).not.toHaveBeenCalled();
    expect(Route.find).not.toHaveBeenCalled();
  });
});

describe("US-017 route details", () => {
    it("requires authentication before loading routes", async () => {
      const response = await callRoute(app(), "get", undefined, false);

      expect(response.status).toBe(401);
      expect(Gym.find).not.toHaveBeenCalled();
      expect(Route.findOne).not.toHaveBeenCalled();
    });

    it.each(["ADMIN", "CLIMBER", "VISITOR"])(
      "refuses %s to update official route details",
      async (role) => {
        const response = await callRoute(app(role), "patch", { grade: "V5" });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("ROLE_FORBIDDEN");
        expect(Gym.find).not.toHaveBeenCalled();
        expect(Route.findOneAndUpdate).not.toHaveBeenCalled();
      },
    );

    it("loads a route only from the selected competition", async () => {
      vi.mocked(Route.findOne).mockReturnValue(query(route));

      const response = await callRoute(app(), "get");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        routeId: ROUTE_ID,
        competitionId: COMPETITION_ID,
        routeNumber: "8",
        name: "Problem 8",
        grade: "V4",
        pointValue: 25,
        notes: "Overhang",
        official: true,
      });
      expect(Route.findOne).toHaveBeenCalledWith({
        _id: ROUTE_ID,
        competitionId: competition._id,
      });
    });

    it("returns 404 when the selected route is not in the competition", async () => {
      const response = await callRoute(app(), "get");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("ROUTE_NOT_FOUND");
      expect(Route.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("does not update a route when its competition belongs to another gym", async () => {
      vi.mocked(Competition.collection.findOne).mockResolvedValue(null);

      const response = await callRoute(app(), "patch", { grade: "V5" });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("COMPETITION_NOT_FOUND");
      expect(Route.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("updates permitted details on only the route in the selected competition", async () => {
      vi.mocked(Route.findOneAndUpdate).mockReturnValue(
        query({
          ...route,
          routeNumber: "9",
          name: "Updated problem",
          grade: "V5",
          pointValue: 30,
          notes: "New notes",
        }),
      );

      const response = await callRoute(app(), "patch", {
        routeNumber: " 9 ",
        name: " Updated problem ",
        grade: " V5 ",
        pointValue: 30,
        notes: " New notes ",
        official: false,
        competitionId: OTHER_COMPETITION_ID,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        routeId: ROUTE_ID,
        competitionId: COMPETITION_ID,
        routeNumber: "9",
        name: "Updated problem",
        grade: "V5",
        pointValue: 30,
        notes: "New notes",
        official: true,
      });
      expect(Route.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: ROUTE_ID, competitionId: competition._id },
        {
          $set: {
            routeNumber: "9",
            name: "Updated problem",
            grade: "V5",
            pointValue: 30,
            notes: "New notes",
          },
        },
        { returnDocument: "after", runValidators: true },
      );
    });

    it("removes the name and notes when both are sent empty", async () => {
      vi.mocked(Route.findOneAndUpdate).mockReturnValue(
        query({ ...route, name: undefined, notes: undefined }),
      );

      const response = await callRoute(app(), "patch", { name: " ", notes: "" });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("name");
      expect(response.body).not.toHaveProperty("notes");
      expect(Route.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: ROUTE_ID, competitionId: competition._id },
        { $set: {}, $unset: { name: 1, notes: 1 } },
        { returnDocument: "after", runValidators: true },
      );
    });

    it("allows notes to be cleared without replacing other route details", async () => {
      vi.mocked(Route.findOneAndUpdate).mockReturnValue(
        query({ ...route, notes: undefined }),
      );

      const response = await callRoute(app(), "patch", { notes: "  " });

      expect(response.status).toBe(200);
      expect(response.body.notes).toBeUndefined();
      expect(Route.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: ROUTE_ID, competitionId: competition._id },
        { $set: {}, $unset: { notes: 1 } },
        { returnDocument: "after", runValidators: true },
      );
    });

    it.each([
      [{}, "body"],
      [{ grade: "V-1" }, "grade"],
      [{ grade: "V18" }, "grade"],
      [{ pointValue: "25" }, "pointValue"],
      [{ pointValue: -1 }, "pointValue"],
      [{ pointValue: 2.5 }, "pointValue"],
      [{ pointValue: 10001 }, "pointValue"],
      [{ routeNumber: "1".repeat(41) }, "routeNumber"],
      [{ name: "n".repeat(51) }, "name"],
      [{ notes: "z".repeat(2001) }, "notes"],
    ])("rejects invalid route updates before saving", async (body, field) => {
      const response = await callRoute(app(), "patch", body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
      if (field !== "body") {
        expect(response.body.fields[field]).toBeTypeOf("string");
      }
      expect(Route.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("maps a duplicate route number to a conflict", async () => {
      vi.mocked(Route.findOneAndUpdate).mockReturnValue({
        lean: vi.fn().mockRejectedValue(
          Object.assign(new Error("duplicate key"), { code: 11000 }),
        ),
      });

      const response = await callRoute(app(), "patch", { routeNumber: "9" });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("ROUTE_EXISTS");
    });

    it("rejects malformed route IDs before looking up a competition", async () => {
      const response = await request(app())
        .patch(`/api/gym-admin/competitions/${COMPETITION_ID}/routes/not-an-id`)
        .set("Authorization", AUTH)
        .send({ grade: "V5" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
      expect(Competition.collection.findOne).not.toHaveBeenCalled();
      expect(Route.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("US-016 route validation and conflicts", () => {
    it.each([undefined, "", "   "])(
      "saves a route without a name when the name is %j",
      async (name) => {
        const response = await call(app(), {
          routeNumber: "9",
          name,
          grade: "V0",
          pointValue: 10,
        });

        expect(response.status).toBe(201);
        expect(Route.create.mock.calls[0][0]).toEqual({
          competitionId: competition._id,
          routeNumber: "9",
          grade: "V0",
          pointValue: 10,
          official: true,
        });
        expect(Route.create.mock.calls[0][0]).not.toHaveProperty("name");
      },
    );

    it("allows notes to be omitted and a point value of 0", async () => {
    const response = await call(app(), {
      routeNumber: "9",
      name: "Problem 9",
      grade: "V0",
      pointValue: 0,
    });

    expect(response.status).toBe(201);
    expect(Route.create).toHaveBeenCalledWith({
      competitionId: competition._id,
      routeNumber: "9",
      name: "Problem 9",
      grade: "V0",
      pointValue: 0,
      official: true,
    });
  });

  it.each([undefined, null, ""])(
    "requires a point value, refusing %j before saving",
    async (pointValue) => {
      const response = await call(app(), {
        routeNumber: "9",
        name: "Problem 9",
        grade: "V0",
        pointValue,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
      expect(response.body.fields).toEqual({
        pointValue: "Enter a whole number of points from 0 to 10,000.",
      });
      expect(Route.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ routeNumber: "8", name: "Problem 8", grade: "V-1" }, "grade"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4.5" }, "grade"],
    [{ routeNumber: "8", name: "Problem 8", grade: "4" }, "grade"],
    [{ routeNumber: " ", name: "Problem 8", grade: "V4" }, "routeNumber"],
    [{ routeNumber: "8", name: 8, grade: "V4" }, "name"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V18" }, "grade"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V99999" }, "grade"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", pointValue: "25" }, "pointValue"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", pointValue: -25 }, "pointValue"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", pointValue: 12.5 }, "pointValue"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", pointValue: 1e300 }, "pointValue"],
    [{ routeNumber: "9".repeat(41), name: "Problem 8", grade: "V4" }, "routeNumber"],
    [{ routeNumber: "8", name: "n".repeat(51), grade: "V4" }, "name"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", notes: "z".repeat(2001) }, "notes"],
    [{ routeNumber: "8", name: "Problem 8", grade: "V4", official: false }, "official"],
  ])("rejects invalid route details before saving", async (body, field) => {
    const response = await call(app(), body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields[field]).toBeTypeOf("string");
    expect(Route.create).not.toHaveBeenCalled();
  });

  it("explains the point and grade limits in plain words", async () => {
    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V18",
      pointValue: -25,
    });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({
      grade: "Enter a V-grade from V0 to V17, such as V4.",
      pointValue: "Enter a whole number of points from 0 to 10,000.",
    });
  });

  it("accepts every field at its limit", async () => {
    const details = {
      routeNumber: "9".repeat(40),
      name: "n".repeat(50),
      grade: "V17",
      pointValue: 10000,
      notes: "z".repeat(2000),
    };

    const response = await call(app(), details);

    expect(response.status).toBe(201);
    expect(Route.create).toHaveBeenCalledWith({
      competitionId: competition._id,
      ...details,
      official: true,
    });
  });

  it("keeps the same limits in the Route model", async () => {
    const valid = {
      competitionId: competition._id,
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
    };
    async function errorsOf(details) {
      try {
        await new Route({ ...valid, ...details }).validate();
        return [];
      } catch (error) {
        return Object.keys(error.errors);
      }
    }

    expect(await errorsOf({ pointValue: 0 })).toEqual([]);
    expect(await errorsOf({ name: undefined })).toEqual([]);
    expect(await errorsOf({ grade: "V17", pointValue: 10000 })).toEqual([]);
    expect(
      await errorsOf({
        routeNumber: "9".repeat(40),
        name: "n".repeat(50),
        notes: "z".repeat(2000),
      }),
    ).toEqual([]);
    expect(await errorsOf({ grade: "V18" })).toEqual(["grade"]);
    expect(await errorsOf({ pointValue: -1 })).toEqual(["pointValue"]);
    expect(await errorsOf({ pointValue: 2.5 })).toEqual(["pointValue"]);
    expect(await errorsOf({ pointValue: 10001 })).toEqual(["pointValue"]);
    expect(await errorsOf({ routeNumber: "9".repeat(41) })).toEqual(["routeNumber"]);
    expect(await errorsOf({ name: "n".repeat(51) })).toEqual(["name"]);
    expect(await errorsOf({ notes: "z".repeat(2001) })).toEqual(["notes"]);
  });

  it("returns 404 for a competition outside the Gym Admin's gyms", async () => {
    vi.mocked(Competition.collection.findOne).mockResolvedValue(null);

    const response = await call(app(), {
      routeNumber: "8",
      name: "Problem 8",
      grade: "V4",
      pointValue: 25,
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
      pointValue: 25,
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
      pointValue: 25,
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
      pointValue: 25,
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
