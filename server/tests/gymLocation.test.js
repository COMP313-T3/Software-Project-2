import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Gym } from "../src/models/Gym.js";
import { createGymRoutes } from "../src/routes/gymRoutes.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const AUTHORIZATION = "Bearer a.b.c";
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };

afterEach(() => {
  vi.restoreAllMocks();
});

function leanQuery(value) {
  const query = {
    collation: vi.fn(() => query),
    populate: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn(async () => value),
  };
  return query;
}

function makeApp() {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({ userId: "user-id", role: "ADMIN", sessionId: "session-id" })),
    },
    sessions: {
      findActive: vi.fn(async () => ({})),
      recordRequest: vi.fn(async () => ({})),
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/gyms", createGymRoutes(auth));
  app.use(errorHandler);
  return app;
}

function post(body) {
  return request(makeApp()).post("/api/gyms").set("Authorization", AUTHORIZATION).send(body);
}

function patch(body) {
  return request(makeApp())
    .patch(`/api/gyms/${GYM_ID}`)
    .set("Authorization", AUTHORIZATION)
    .send(body);
}

/** Stubs the database for a PATCH of the gym, answering the update with `updated`. */
function currentGym(updated, current = { _id: GYM_ID, name: "Hogtown", location: "Toronto" }) {
  vi.spyOn(Gym, "findById").mockReturnValue(leanQuery(current));
  vi.spyOn(Gym, "findOne").mockReturnValue(leanQuery(null));
  return vi.spyOn(Gym, "findByIdAndUpdate").mockReturnValue(leanQuery(updated));
}

describe("POST /api/gyms map pin", () => {
  it("saves the pin as a GeoJSON point and answers it as coordinates", async () => {
    vi.spyOn(Gym.collection, "findOne").mockResolvedValue(null);
    const insert = vi
      .spyOn(Gym.collection, "insertOne")
      .mockResolvedValue({ acknowledged: true, insertedId: new mongoose.Types.ObjectId() });

    const response = await post({
      name: "Hogtown Bouldering",
      location: "1 Bathurst St, Toronto",
      coordinates: HOGTOWN,
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(insert.mock.calls[0][0].mapPoint).toEqual({
      type: "Point",
      coordinates: [HOGTOWN.lng, HOGTOWN.lat],
    });
    expect(response.body).toMatchObject({
      name: "Hogtown Bouldering",
      location: "1 Bathurst St, Toronto",
      status: "ACTIVE",
      coordinates: HOGTOWN,
    });
    expect(response.body.mapPoint).toBeUndefined();
  });

  it("adds a gym without a pin when none is chosen", async () => {
    vi.spyOn(Gym.collection, "findOne").mockResolvedValue(null);
    const insert = vi
      .spyOn(Gym.collection, "insertOne")
      .mockResolvedValue({ acknowledged: true, insertedId: new mongoose.Types.ObjectId() });

    const response = await post({ name: "Hogtown Bouldering", location: "Toronto" });

    expect(response.status).toBe(201);
    expect(insert.mock.calls[0][0]).not.toHaveProperty("mapPoint");
    expect(response.body.coordinates).toBeNull();
  });

  it("refuses a pin off the map", async () => {
    const insert = vi.spyOn(Gym.collection, "insertOne");

    const response = await post({
      name: "Hogtown Bouldering",
      location: "Toronto",
      coordinates: { lat: 91, lng: -79.4 },
    });

    expect(response.status).toBe(400);
    expect(response.body.fields.coordinates).toBe("Choose the location on the map again.");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("GET /api/gyms map pins", () => {
  it("answers each gym's pin as coordinates, or null without one", async () => {
    const pinned = {
      _id: GYM_ID,
      name: "Hogtown",
      location: "Toronto",
      status: "ACTIVE",
      mapPoint: { type: "Point", coordinates: [HOGTOWN.lng, HOGTOWN.lat] },
    };
    const unpinned = { ...pinned, _id: "507f1f77bcf86cd799439012", name: "Lakeshore", mapPoint: undefined };
    vi.spyOn(Gym, "find").mockReturnValue(leanQuery([pinned, unpinned]));
    vi.spyOn(Gym, "countDocuments").mockResolvedValue(2);

    const response = await request(makeApp()).get("/api/gyms").set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body.gyms.map(({ name, coordinates }) => ({ name, coordinates }))).toEqual([
      { name: "Hogtown", coordinates: HOGTOWN },
      { name: "Lakeshore", coordinates: null },
    ]);
    expect(response.body.gyms[0].mapPoint).toBeUndefined();
  });
});

describe("PATCH /api/gyms/:gymId map pin", () => {
  it("saves a chosen pin and answers it", async () => {
    const update = currentGym({
      _id: GYM_ID,
      name: "Hogtown",
      location: "Toronto",
      status: "ACTIVE",
      adminIds: [],
      mapPoint: { type: "Point", coordinates: [HOGTOWN.lng, HOGTOWN.lat] },
    });

    const response = await patch({ coordinates: HOGTOWN });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(update).toHaveBeenCalledWith(
      GYM_ID,
      { $set: { mapPoint: { type: "Point", coordinates: [HOGTOWN.lng, HOGTOWN.lat] } } },
      { new: true, runValidators: true },
    );
    expect(response.body.coordinates).toEqual(HOGTOWN);
  });

  it("removes the pin when coordinates is null", async () => {
    const update = currentGym({
      _id: GYM_ID,
      name: "Hogtown",
      location: "Toronto",
      status: "ACTIVE",
      adminIds: [],
    });

    const response = await patch({ coordinates: null });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      GYM_ID,
      { $unset: { mapPoint: 1 } },
      { new: true, runValidators: true },
    );
    expect(response.body.coordinates).toBeNull();
  });

  it("changes the location and the pin together", async () => {
    const update = currentGym({
      _id: GYM_ID,
      name: "Hogtown",
      location: "1 Bathurst St, Toronto",
      status: "ACTIVE",
      adminIds: [],
    });

    const response = await patch({ location: "1 Bathurst St, Toronto", coordinates: null });

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1]).toEqual({
      $set: { location: "1 Bathurst St, Toronto" },
      $unset: { mapPoint: 1 },
    });
  });
});
