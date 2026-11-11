import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { User } from "../src/models/User.js";
import { createUserRoutes } from "../src/routes/userRoutes.js";
import { logger } from "../src/utils/logger.js";

const CLIMBER = "6650000000000000000000e1";
const GYM_ADMIN = "6650000000000000000000e2";
const ADMIN = "6650000000000000000000e3";
const OTHER = "6650000000000000000000e4";
const path = "/api/users/me/onboarding";
const SEEN = new Date("2026-11-09T15:00:00.000Z");

let users;

const same = (a, b) => String(a) === String(b);
const matches = (row, filter) =>
  Object.entries(filter).every(([field, value]) =>
    value === null ? row[field] === undefined || row[field] === null : same(row[field], value),
  );

function api({ userId = CLIMBER, role = "CLIMBER" } = {}) {
  const auth = {
    accessTokens: { verify: vi.fn(async () => ({ userId, role, sessionId: "session-id" })) },
    sessions: { findActive: vi.fn(async () => ({})), recordRequest: vi.fn(async () => ({})) },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/users", createUserRoutes({ auth, recaptchaSecretKey: "", signupLimitPerHour: 5 }));
  app.use(errorHandler);
  return app;
}

const read = (who) => request(api(who)).get(path).set("Authorization", "Bearer test.access.token");
const save = (body, who) => request(api(who)).put(path).set("Authorization", "Bearer test.access.token").send(body);

beforeEach(() => {
  users = [
    { _id: CLIMBER, role: "CLIMBER", isActive: true },
    { _id: GYM_ADMIN, role: "GYM_ADMIN", isActive: true },
    { _id: ADMIN, role: "ADMIN", isActive: true, onboardingSeenAt: SEEN },
    { _id: OTHER, role: "CLIMBER", isActive: true },
  ];
  vi.spyOn(User, "findOne").mockImplementation((filter) => ({
    lean: async () => structuredClone(users.find((user) => matches(user, filter)) ?? null),
  }));
  vi.spyOn(User, "updateOne").mockImplementation(async (filter, update) => {
    const user = users.find((row) => matches(row, filter));
    if (user) Object.assign(user, update.$set);
    return { matchedCount: user ? 1 : 0, modifiedCount: user ? 1 : 0 };
  });
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("US-037 the onboarding tutorial's state on the account", () => {
  it.each([
    ["CLIMBER", CLIMBER],
    ["GYM_ADMIN", GYM_ADMIN],
  ])("says a %s who hasn't seen the tutorial hasn't", async (role, userId) => {
    const response = await read({ userId, role });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ seen: false, seenAt: null });
  });

  it("says when the user first saw it", async () => {
    const response = await read({ userId: ADMIN, role: "ADMIN" });

    expect(response.body).toEqual({ seen: true, seenAt: "2026-11-09T15:00:00.000Z" });
  });

  it("records the first time the tutorial was finished or skipped", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-10T04:00:00.000Z") });

    const response = await save({ seen: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ seen: true, seenAt: "2026-11-10T04:00:00.000Z" });
    expect((await read()).body).toEqual({ seen: true, seenAt: "2026-11-10T04:00:00.000Z" });
  });

  it("keeps the first time when the tutorial is watched again", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-12T09:00:00.000Z") });

    const response = await save({ seen: true }, { userId: ADMIN, role: "ADMIN" });

    expect(response.body).toEqual({ seen: true, seenAt: "2026-11-09T15:00:00.000Z" });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: ADMIN, isActive: true, onboardingSeenAt: null },
      { $set: { onboardingSeenAt: new Date("2026-11-12T09:00:00.000Z") } },
    );
  });

  it("only ever records it for the user in the access token", async () => {
    await save({ seen: true, userId: OTHER, _id: OTHER });

    expect(users.find((user) => user._id === OTHER).onboardingSeenAt).toBeUndefined();
    expect(users.find((user) => user._id === CLIMBER).onboardingSeenAt).toBeInstanceOf(Date);
  });

  it.each([
    ["no body", undefined],
    ["seen as false", { seen: false }],
    ["seen as text", { seen: "true" }],
    ["a query object", { seen: { $ne: null } }],
  ])("refuses %s", async (_label, body) => {
    const response = await save(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.fields).toEqual({ seen: "Send seen as true once the tutorial is finished or skipped." });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("needs a login to read or record it", async () => {
    const app = api();

    const reading = await request(app).get(path);
    const saving = await request(app).put(path).send({ seen: true });

    expect(reading.status).toBe(401);
    expect(saving.status).toBe(401);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("treats a deactivated account as logged out", async () => {
    users[0].isActive = false;

    const reading = await read();
    const saving = await save({ seen: true });

    for (const response of [reading, saving]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("SESSION_EXPIRED");
    }
    expect(users[0].onboardingSeenAt).toBeUndefined();
  });

  it("is part of the API, behind the login check", async () => {
    const app = createApp({ clientOrigins: [], authSecret: randomUUID(), mailer: null });

    const reading = await request(app).get(path);
    const saving = await request(app).put(path).send({ seen: true });

    for (const response of [reading, saving]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("NOT_AUTHENTICATED");
    }
  });
});
