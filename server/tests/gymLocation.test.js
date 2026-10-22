import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { createGymRoutes } from "../src/routes/gymRoutes.js";
import { parseCalendarDate, torontoToday } from "../src/utils/calendarDates.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const AUTHORIZATION = "Bearer a.b.c";
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };
const NAME_LETTERS = "Gym name must include letters, not only numbers or symbols.";
const LOCATION_LETTERS = "Location must include letters, not only numbers or symbols.";

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

describe("gym name and location letters (US-004, US-005)", () => {
  it.each(["12345", "!?--"])(
    "asks for letters in a new gym's name and location, like Add gym (%s)",
    async (value) => {
      const lookup = vi.spyOn(Gym, "findOne");

      const response = await post({ name: value, location: value });

      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual({ name: NAME_LETTERS, location: LOCATION_LETTERS });
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it("accepts letters with numbers and international text", async () => {
    vi.spyOn(Gym.collection, "findOne").mockResolvedValue(null);
    vi.spyOn(Gym.collection, "insertOne").mockResolvedValue({
      acknowledged: true,
      insertedId: new mongoose.Types.ObjectId(),
    });

    const response = await post({ name: "攀岩馆 9", location: "北京市朝阳路123号" });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
  });

  it.each([
    [{ name: "12345" }, { name: NAME_LETTERS }],
    [{ location: "!?--" }, { location: LOCATION_LETTERS }],
    [{ name: "2024", location: "#1" }, { name: NAME_LETTERS, location: LOCATION_LETTERS }],
  ])("asks for letters when a gym is edited, like Add gym: %j", async (body, fields) => {
    const lookup = vi.spyOn(Gym, "findById");

    const response = await patch(body);

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(fields);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("asks for the name before its letters", async () => {
    const response = await patch({ name: "   " });

    expect(response.status).toBe(400);
    expect(response.body.fields.name).toBe("Enter the gym name.");
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
    const competitions = vi.spyOn(Competition, "updateMany");

    const response = await patch({ coordinates: HOGTOWN });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(update).toHaveBeenCalledWith(
      GYM_ID,
      { $set: { mapPoint: { type: "Point", coordinates: [HOGTOWN.lng, HOGTOWN.lat] } } },
      { new: true, runValidators: true },
    );
    expect(response.body.coordinates).toEqual(HOGTOWN);
    expect(competitions).not.toHaveBeenCalled();
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
    vi.spyOn(Competition, "updateMany").mockResolvedValue({ modifiedCount: 0 });

    const response = await patch({ location: "1 Bathurst St, Toronto", coordinates: null });

    expect(response.status).toBe(200);
    expect(update.mock.calls[0][1]).toEqual({
      $set: { location: "1 Bathurst St, Toronto" },
      $unset: { mapPoint: 1 },
    });
  });
});

describe("PATCH /api/gyms/:gymId location and its competitions", () => {
  it("gives the gym's competitions from today on its new location", async () => {
    currentGym({
      _id: new mongoose.Types.ObjectId(GYM_ID),
      name: "Hogtown",
      location: "1 Bathurst St, Toronto",
      status: "ACTIVE",
      adminIds: [],
    });
    // Only the database is stubbed, so Mongoose builds and sanitizes the update as it runs.
    const competitions = vi
      .spyOn(Competition.collection, "updateMany")
      .mockResolvedValue({ acknowledged: true, matchedCount: 2, modifiedCount: 2 });

    const response = await patch({ location: " 1 Bathurst St, Toronto " });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(competitions).toHaveBeenCalledOnce();
    const [filter, update] = competitions.mock.calls[0];
    expect(String(filter.gymId)).toBe(GYM_ID);
    expect(filter.date.$gte.toISOString()).toBe(
      parseCalendarDate(torontoToday()).date.toISOString(),
    );
    expect(update.$set).toMatchObject({ location: "1 Bathurst St, Toronto" });
  });

  it("leaves the competitions alone when only the name changes", async () => {
    currentGym({ _id: GYM_ID, name: "Hogtown Bouldering", location: "Toronto", status: "ACTIVE", adminIds: [] });
    const competitions = vi.spyOn(Competition, "updateMany");

    const response = await patch({ name: "Hogtown Bouldering" });

    expect(response.status).toBe(200);
    expect(competitions).not.toHaveBeenCalled();
  });

  it("keeps the competitions when the gym's location can't be saved", async () => {
    vi.spyOn(Gym, "findById").mockReturnValue(
      leanQuery({ _id: GYM_ID, name: "Hogtown", location: "Toronto" }),
    );
    vi.spyOn(Gym, "findOne").mockReturnValue(leanQuery({ _id: "507f1f77bcf86cd799439012" }));
    const competitions = vi.spyOn(Competition, "updateMany");

    const response = await patch({ location: "Ottawa" });

    expect(response.status).toBe(409);
    expect(competitions).not.toHaveBeenCalled();
  });
});
