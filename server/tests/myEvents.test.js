import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Registration } from "../src/models/Registration.js";
import { createCompetitionRoutes } from "../src/routes/competitionRoutes.js";

const USER_ID = "507f1f77bcf86cd799439013";
const OTHER_USER_ID = "507f1f77bcf86cd799439014";
const GYM_ID = "507f1f77bcf86cd799439021";
const COMPETITION_ID = "507f1f77bcf86cd799439031";
const REGISTRATION_ID = "507f1f77bcf86cd799439041";
const DIVISION_ID = "507f1f77bcf86cd799439051";
const MY_EVENTS_PATH = "/api/competitions/my-events";

const objectId = (value) => new mongoose.Types.ObjectId(value);

function query(value) {
  const result = {
    populate: vi.fn(() => result),
    lean: vi.fn(async () => value),
  };
  return result;
}

function app(role = "CLIMBER", authenticated = true) {
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
  api.use("/api/competitions", createCompetitionRoutes({ auth }));
  api.use(errorHandler);
  return { api, authenticated };
}

function get({ role = "CLIMBER", authenticated = true, path = MY_EVENTS_PATH } = {}) {
  const setup = app(role, authenticated);
  const req = request(setup.api).get(path);
  if (setup.authenticated) req.set("Authorization", "Bearer test.access.token");
  return req;
}

function registration(status = "CONFIRMED") {
  return {
    _id: objectId(REGISTRATION_ID),
    competitionId: {
      _id: objectId(COMPETITION_ID),
      name: "Autumn Open",
      date: new Date("2026-11-20T00:00:00.000Z"),
      location: "Toronto",
      status: "PUBLISHED",
      registrationStatus: "CLOSED",
      gymId: { _id: objectId(GYM_ID), name: "North Wall", status: "ACTIVE" },
    },
    divisionId: { _id: objectId(DIVISION_ID), name: "Open" },
    status,
    registeredAt: new Date("2026-10-20T15:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T17:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/competitions/my-events (US-030)", () => {
  it("returns the logged-in Climber's registrations with the related competition information", async () => {
    vi.spyOn(Registration, "find").mockReturnValue(
      query([registration(), registration("WAITLIST")]),
    );

    const response = await get({
      path: `${MY_EVENTS_PATH}?climberId=${OTHER_USER_ID}&userId=${OTHER_USER_ID}`,
    });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Registration.find).toHaveBeenCalledWith(
      { climberId: USER_ID },
      "competitionId divisionId status registeredAt",
    );
    expect(response.body.events).toHaveLength(2);
    expect(response.body.events[0]).toEqual({
      competition: {
        _id: COMPETITION_ID,
        name: "Autumn Open",
        date: "2026-11-20",
        location: "Toronto",
        gym: { _id: GYM_ID, name: "North Wall", active: true },
        status: "PUBLISHED",
        upcoming: true,
        registrationStatus: "CLOSED",
      },
      registration: {
        registrationId: REGISTRATION_ID,
        status: "CONFIRMED",
        statusLabel: "Confirmed",
        registeredAt: new Date("2026-10-20T15:00:00.000Z").toISOString(),
        division: { _id: DIVISION_ID, name: "Open" },
      },
    });
    expect(response.body.events[1].registration).toMatchObject({
      status: "WAITLIST",
      statusLabel: "On the waitlist",
    });
  });

  it("returns an empty list when the Climber has no registrations", async () => {
    vi.spyOn(Registration, "find").mockReturnValue(query([]));

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ events: [] });
  });

  it("requires authentication and the CLIMBER role before reading registrations", async () => {
    vi.spyOn(Registration, "find").mockReturnValue(query([]));

    expect((await get({ authenticated: false })).status).toBe(401);
    expect((await get({ role: "ADMIN" })).status).toBe(403);
    expect((await get({ role: "GYM_ADMIN" })).status).toBe(403);
    expect(Registration.find).not.toHaveBeenCalled();
  });

  it("returns a generic server error when registrations cannot be loaded", async () => {
    vi.spyOn(Registration, "find").mockImplementation(() => {
      throw new Error("database details");
    });

    const response = await get();

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      error: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    });
    expect(JSON.stringify(response.body)).not.toContain("database details");
  });
});
