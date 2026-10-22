import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { createGymAdminRoutes } from "../src/routes/gymAdminRoutes.js";
import { parseCalendarDate, torontoToday } from "../src/utils/calendarDates.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

const GYM_ID = "507f1f77bcf86cd799439011";
const COMPETITION_ID = "507f1f77bcf86cd799439012";
const AUTH = "Bearer a.b.c";
const gym = { _id: new mongoose.Types.ObjectId(GYM_ID), name: "North Gym", location: "1 Bathurst St, Toronto" };

function query(value) {
  const result = {
    sort: vi.fn(() => result),
    collation: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

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

function nextWeek() {
  const date = parseCalendarDate(torontoToday()).date;
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.spyOn(Gym, "find").mockReturnValue(query([gym]));
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/gym-admin/competitions location", () => {
  it("holds the competition at its gym, whatever location or pin is sent", async () => {
    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(Competition, "findOne").mockReturnValue(query(null));
    // Only the database is stubbed, so the saved record is the one Mongoose would write.
    const insert = vi
      .spyOn(Competition.collection, "insertOne")
      .mockResolvedValue({ acknowledged: true, insertedId: new mongoose.Types.ObjectId() });

    const response = await request(app())
      .post("/api/gym-admin/competitions")
      .set("Authorization", AUTH)
      .send({
        name: "Autumn Open",
        date: nextWeek(),
        capacity: 40,
        location: "Somewhere else",
        coordinates: { lat: 45.4215, lng: -75.6972 },
      });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const saved = insert.mock.calls[0][0];
    expect(saved.location).toBe(gym.location);
    expect(saved).not.toHaveProperty("mapPoint");
    expect(response.body.location).toBe(gym.location);
    expect(response.body.coordinates).toBeNull();
  });
});

describe("PATCH /api/gym-admin/competitions/:competitionId location", () => {
  it.each([
    ["a location", { location: "Somewhere else" }],
    ["a map pin", { coordinates: { lat: 45.4215, lng: -75.6972 } }],
    ["no map pin", { coordinates: null }],
  ])("refuses %s, which come from the gym", async (_, body) => {
    const lookup = vi.spyOn(Competition, "findOne");
    const update = vi.spyOn(Competition, "findOneAndUpdate");

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Change at least one competition detail.");
    expect(lookup).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("changes the other details and leaves the location and pin alone", async () => {
    const current = {
      _id: COMPETITION_ID,
      gymId: GYM_ID,
      name: "Autumn Open",
      date: new Date(`${nextWeek()}T00:00:00.000Z`),
      location: gym.location,
      capacity: 40,
      registrationStatus: "CLOSED",
      status: "DRAFT",
    };
    vi.spyOn(Competition, "findOne").mockReturnValue(query(current));
    vi.spyOn(Registration, "countDocuments").mockResolvedValue(0);
    const update = vi
      .spyOn(Competition, "findOneAndUpdate")
      .mockReturnValue(query({ ...current, name: "Winter Open" }));

    const response = await request(app())
      .patch(`/api/gym-admin/competitions/${COMPETITION_ID}`)
      .set("Authorization", AUTH)
      .send({
        name: "Winter Open",
        location: "Somewhere else",
        coordinates: { lat: 45.4215, lng: -75.6972 },
      });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(update.mock.calls[0][1]).toEqual({ $set: { name: "Winter Open" } });
    expect(response.body.location).toBe(gym.location);
  });
});
