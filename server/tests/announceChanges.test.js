// Automated tests for what a write announces to open pages, so they reload the data it changed.
// They need no database or network.
// Run from the server folder with:  npm test -- tests/announceChanges.test.js

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { PAGE_TOPIC } from "../src/constants/pageUpdates.js";
import { announceChanges, changesFor } from "../src/middleware/announceChanges.js";
import { onPageChanged } from "../src/services/pageUpdateEvents.js";
import { logger } from "../src/utils/logger.js";

const COMPETITION = "6650000000000000000000c1";
const { COMPETITIONS, RESULTS, GYMS, USERS, GYM_REQUESTS, SETTINGS } = PAGE_TOPIC;

const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
});

/** Every change announced from now until the test ends. */
function announced() {
  const changes = [];
  stops.push(onPageChanged((change) => changes.push(change)));
  return changes;
}

const about = (competitionId, ...topics) => topics.map((topic) => ({ topic, competitionId }));
const topics = (...names) => names.map((topic) => ({ topic }));

describe("what a write announces to open pages", () => {
  it.each([
    ["POST", "/gym-admin/competitions", topics(COMPETITIONS)],
    ["PATCH", `/gym-admin/competitions/${COMPETITION}`, about(COMPETITION, COMPETITIONS)],
    ["POST", `/gym-admin/competitions/${COMPETITION}/divisions`, about(COMPETITION, COMPETITIONS)],
    ["PUT", `/gym-admin/competitions/${COMPETITION}/climbers/u1/division`, about(COMPETITION, COMPETITIONS)],
    ["PATCH", `/gym-admin/competitions/${COMPETITION}/climbers/u1`, about(COMPETITION, COMPETITIONS)],
    ["DELETE", `/gym-admin/competitions/${COMPETITION}/climbers/u1`, about(COMPETITION, COMPETITIONS)],
    ["PUT", `/gym-admin/competitions/${COMPETITION}/display-settings`, about(COMPETITION, COMPETITIONS)],
    ["POST", `/competitions/${COMPETITION}/registrations`, about(COMPETITION, COMPETITIONS)],
  ])("%s %s is a change to a competition", (method, path, expected) => {
    expect(changesFor(method, path)).toEqual(expected);
  });

  it.each([
    ["POST", `/gym-admin/competitions/${COMPETITION}/routes`],
    ["PATCH", `/gym-admin/competitions/${COMPETITION}/routes/r1`],
    ["PUT", `/gym-admin/competitions/${COMPETITION}/scoring`],
  ])("%s %s changes the competition and every score worked out from it", (method, path) => {
    expect(changesFor(method, path)).toEqual(about(COMPETITION, COMPETITIONS, RESULTS));
  });

  it.each([
    ["PUT", `/gym-admin/competitions/${COMPETITION}/climbers/u1/routes/r1/result`],
    ["DELETE", `/gym-admin/competitions/${COMPETITION}/climbers/u1/routes/r1/result`],
    ["POST", `/gym-admin/competitions/${COMPETITION}/climbers/u1/routes/r1/attempts`],
    ["PUT", `/competitions/${COMPETITION}/scorecard/routes/r1/result`],
    ["DELETE", `/competitions/${COMPETITION}/scorecard/routes/r1/result`],
  ])("%s %s is a change to that competition's results only", (method, path) => {
    expect(changesFor(method, path)).toEqual(about(COMPETITION, RESULTS));
  });

  it.each([
    ["PATCH", "/admin/settings", topics(SETTINGS)],
    ["PATCH", "/admin/gym-requests/q1/review", topics(GYM_REQUESTS, GYMS)],
    ["POST", "/admin/gym-requests/q1/setup-link", topics(GYM_REQUESTS, GYMS)],
    ["DELETE", "/admin/gym-requests/q1", topics(GYM_REQUESTS, GYMS)],
    ["PATCH", "/admin/gym-admins/u1", topics(USERS, GYMS)],
    ["PUT", "/admin/gym-admins/u1/gyms/g1", topics(USERS, GYMS)],
    ["DELETE", "/admin/gym-admins/u1/gyms/g1", topics(USERS, GYMS)],
    ["PATCH", "/admin/gym-admins/u1/deactivate", topics(USERS, GYMS)],
    ["PATCH", "/admin/users/u1", topics(USERS)],
    ["PATCH", "/admin/users/u1/deactivate", topics(USERS)],
    ["POST", "/gyms", topics(GYMS, COMPETITIONS)],
    ["PATCH", "/gyms/g1", topics(GYMS, COMPETITIONS)],
    ["PATCH", "/gyms/g1/deactivate", topics(GYMS, COMPETITIONS)],
    ["PUT", "/gyms/g1/admins/u1", topics(GYMS, USERS)],
    ["POST", "/gym-requests", topics(GYM_REQUESTS)],
    ["POST", "/gym-requests/setup", topics(GYM_REQUESTS, USERS, GYMS)],
    ["POST", "/users/climbers", topics(USERS)],
  ])("%s %s announces what it changes for System Administrators and the gyms", (method, path, expected) => {
    expect(changesFor(method, path)).toEqual(expected);
  });

  it.each([
    ["POST", "/auth/login"],
    ["POST", "/auth/logout"],
    ["POST", "/auth/reset-password"],
    ["POST", "/session/ping"],
    ["PUT", "/users/me/onboarding"],
    ["POST", "/gym-requests/setup/check"],
    ["POST", `/competitions/${COMPETITION}/route-assistant`],
    ["POST", `/gym-admin/competitions/${COMPETITION}/route-assistant`],
  ])("%s %s changes nothing a page lists", (method, path) => {
    expect(changesFor(method, path)).toEqual([]);
  });

  it("announces nothing for a read", () => {
    expect(changesFor("GET", `/gym-admin/competitions/${COMPETITION}`)).toEqual([]);
    expect(changesFor("HEAD", "/gyms")).toEqual([]);
    expect(changesFor("OPTIONS", "/gyms")).toEqual([]);
  });

  it("announces everything but results for a write it has no rule for, so pages stay current", () => {
    expect(changesFor("POST", "/something/new")).toEqual(topics(COMPETITIONS, GYMS, USERS, GYM_REQUESTS, SETTINGS));
  });

  it("reads a path that ends with a slash the same way", () => {
    expect(changesFor("POST", "/gyms/")).toEqual(topics(GYMS, COMPETITIONS));
  });
});

describe("announcing a change after a request", () => {
  function api(status = 200) {
    const app = express();
    app.use("/api", announceChanges);
    app.use("/api", (req, res) => res.status(status).json({ ok: status < 400 }));
    return app;
  }

  it("announces what a successful write changed, with the competition it's about", async () => {
    const changes = announced();

    await request(api(201)).post(`/api/gym-admin/competitions/${COMPETITION}/routes?sort=number`).send({});

    expect(changes).toEqual(about(COMPETITION, COMPETITIONS, RESULTS));
  });

  it("announces nothing when the write failed", async () => {
    const changes = announced();

    await request(api(400)).post("/api/gyms").send({});
    await request(api(409)).patch("/api/admin/settings").send({});
    await request(api(500)).post("/api/gym-requests").send({});

    expect(changes).toEqual([]);
  });

  it("announces nothing for a read", async () => {
    const changes = announced();

    await request(api()).get("/api/gyms");

    expect(changes).toEqual([]);
  });

  it("is part of the API, ahead of its routes", () => {
    const app = createApp({ clientOrigins: ["http://localhost:5173"] });
    const layers = app.router.stack.map((layer) => layer.handle);

    expect(layers).toContain(announceChanges);
    expect(layers.indexOf(announceChanges)).toBeLessThan(layers.length - 3);
  });

  it("never fails the request when a listener throws", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    stops.push(
      onPageChanged(() => {
        throw new Error("listener broke");
      }),
    );

    const response = await request(api()).post("/api/gyms").send({});

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith("Page update failed", expect.objectContaining({ topic: GYMS }));
  });
});
