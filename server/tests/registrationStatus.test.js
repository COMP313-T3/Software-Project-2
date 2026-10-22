import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { Registration } from "../src/models/Registration.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";

const USER_ID = "507f1f77bcf86cd799439013";
const SOMEONE_ELSE = "507f1f77bcf86cd799439014";
const GYM_ID = "507f1f77bcf86cd799439021";
const COMPETITION_ID = "507f1f77bcf86cd799439031";
const REGISTRATION_ID = "507f1f77bcf86cd799439041";
const DIVISION_ID = "507f1f77bcf86cd799439051";
const STATUS_PATH = `/api/competitions/${COMPETITION_ID}/registration`;

const objectId = (value) => new mongoose.Types.ObjectId(value);
const competition = {
  _id: objectId(COMPETITION_ID),
  gymId: objectId(GYM_ID),
  name: "Autumn Open",
  date: new Date("2026-11-20T00:00:00.000Z"),
  location: "Toronto",
  status: "PUBLISHED",
  registrationStatus: "OPEN",
  capacity: 2,
};
const gym = { _id: objectId(GYM_ID), name: "North Wall", status: "ACTIVE" };

function query(value) {
  const result = {
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
        role: "CLIMBER",
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

function get(path = STATUS_PATH) {
  return request(app()).get(path).set("Authorization", "Bearer a.b.c");
}

function registrationOf(status) {
  return {
    _id: objectId(REGISTRATION_ID),
    competitionId: competition._id,
    status,
    divisionId: { _id: objectId(DIVISION_ID), name: "Open" },
    registeredAt: new Date("2026-10-20T15:00:00.000Z"),
  };
}

function stored({
  event = competition,
  home = gym,
  registration = null,
  confirmed = 0,
}) {
  vi.spyOn(Competition, "findById").mockReturnValue(query(event));
  vi.spyOn(Gym, "findById").mockReturnValue(query(home));
  vi.spyOn(Registration, "findOne").mockReturnValue(query(registration));
  vi.spyOn(Registration, "countDocuments").mockResolvedValue(confirmed);
}

afterEach(() => vi.restoreAllMocks());

describe("GET /api/competitions/:competitionId/registration (US-029)", () => {
  it("reads only the logged-in Climber's own registration for the competition", async () => {
    stored({ registration: registrationOf("CONFIRMED"), confirmed: 1 });

    const response = await get(
      `${STATUS_PATH}?climberId=${SOMEONE_ELSE}&userId=${SOMEONE_ELSE}`,
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Registration.findOne.mock.calls[0][0]).toEqual({
      competitionId: COMPETITION_ID,
      climberId: USER_ID,
    });
    expect(Competition.findById.mock.calls[0][0]).toBe(COMPETITION_ID);
    expect(response.body).toMatchObject({
      competition: { _id: COMPETITION_ID, name: "Autumn Open" },
      registration: { registrationId: REGISTRATION_ID, status: "CONFIRMED" },
    });
  });

  it.each([
    [
      "CONFIRMED",
      true,
      2,
      { capacity: 2, confirmed: 2, spacesLeft: 0, full: true },
    ],
    [
      "PENDING",
      false,
      1,
      { capacity: 2, confirmed: 1, spacesLeft: 1, full: false },
    ],
  ])(
    "shows a %s registration with confirmed: %s and whether the competition is full",
    async (status, confirmed, count, capacity) => {
      stored({ registration: registrationOf(status), confirmed: count });

      const response = await get();

      expect(response.status).toBe(200);
      expect(response.body.registration).toMatchObject({ status, confirmed });
      expect(response.body.capacity).toEqual(capacity);
      expect(Registration.countDocuments).toHaveBeenCalledWith({
        competitionId: competition._id,
        status: "CONFIRMED",
      });
    },
  );

  it("answers REGISTRATION_NOT_FOUND for a competition the Climber can discover but didn't register for", async () => {
    stored({ registration: null });

    const response = await get();

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "REGISTRATION_NOT_FOUND",
      message: "You're not registered for this competition.",
    });
  });

  it.each([
    [
      "a draft",
      { ...competition, status: "DRAFT", registrationStatus: "CLOSED" },
      gym,
    ],
    ["a cancelled competition", { ...competition, status: "CANCELLED" }, gym],
    [
      "an inactive gym's competition",
      competition,
      { ...gym, status: "INACTIVE" },
    ],
    ["a missing competition", null, gym],
  ])(
    "answers COMPETITION_NOT_FOUND to an unregistered Climber for %s",
    async (_, event, home) => {
      stored({ event, home });

      const response = await get();

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "COMPETITION_NOT_FOUND",
        message: "Competition not found.",
      });
    },
  );

  it.each([
    ["a cancelled competition", { ...competition, status: "CANCELLED" }, gym],
    [
      "an inactive gym's competition",
      competition,
      { ...gym, status: "INACTIVE" },
    ],
  ])(
    "still shows the Climber's own registration for %s",
    async (_, event, home) => {
      stored({
        event,
        home,
        registration: registrationOf("CONFIRMED"),
        confirmed: 1,
      });

      const response = await get();

      expect(response.status).toBe(200);
      expect(response.body.registration).toMatchObject({
        status: "CONFIRMED",
        confirmed: true,
      });
    },
  );
});
