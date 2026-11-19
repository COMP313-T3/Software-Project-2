// Automated tests that a read a page makes by itself, after a live update, doesn't count as the
// user's activity, so an open page can't keep a session going.
// They need no database or network.
// Run from the server folder with:  npm test -- tests/automaticRequests.test.js

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AUTOMATIC_REQUEST_HEADER } from "../src/constants/pageUpdates.js";
import { ROLES } from "../src/constants/roles.js";
import { requireAuth } from "../src/middleware/requireAuth.js";

describe("a page's own reload isn't the user's activity", () => {
  function api() {
    const session = { _id: "session-id" };
    const auth = {
      accessTokens: { verify: vi.fn(async () => ({ userId: "u1", role: ROLES.CLIMBER, sessionId: "session-id" })) },
      sessions: {
        findActive: vi.fn(async () => session),
        recordRequest: vi.fn(async () => ({ expiresIn: 3600, limitReached: false })),
        timing: vi.fn(() => ({ expiresIn: 1200, limitReached: false })),
      },
    };
    const app = express();
    app.use(requireAuth(auth));
    app.use((req, res) => res.json(req.auth.timing));
    return { app, auth };
  }
  const TOKEN = "Bearer aaa.bbb.ccc";

  it("names the header pages send", () => {
    expect(AUTOMATIC_REQUEST_HEADER).toBe("X-TopSend-Automatic");
  });

  it("counts an ordinary read as activity", async () => {
    const { app, auth } = api();

    const response = await request(app).get("/").set("Authorization", TOKEN);

    expect(auth.sessions.recordRequest).toHaveBeenCalledOnce();
    expect(response.body.expiresIn).toBe(3600);
  });

  it("doesn't count a read the page made by itself, and still answers it", async () => {
    const { app, auth } = api();

    const response = await request(app).get("/").set("Authorization", TOKEN).set(AUTOMATIC_REQUEST_HEADER, "1");

    expect(response.status).toBe(200);
    expect(auth.sessions.recordRequest).not.toHaveBeenCalled();
    expect(response.body.expiresIn).toBe(1200);
  });

  it("still checks the login of a read the page made by itself", async () => {
    const { app, auth } = api();

    await request(app).get("/").set("Authorization", TOKEN).set(AUTOMATIC_REQUEST_HEADER, "1");

    expect(auth.accessTokens.verify).toHaveBeenCalledOnce();
    expect(auth.sessions.findActive).toHaveBeenCalledWith("session-id", "u1");
  });

  it("counts a write as activity whatever the header says", async () => {
    const { app, auth } = api();

    await request(app).post("/").set("Authorization", TOKEN).set(AUTOMATIC_REQUEST_HEADER, "1").send({});

    expect(auth.sessions.recordRequest).toHaveBeenCalledOnce();
  });

  it("ignores any other value of the header", async () => {
    const { app, auth } = api();

    await request(app).get("/").set("Authorization", TOKEN).set(AUTOMATIC_REQUEST_HEADER, "yes");

    expect(auth.sessions.recordRequest).toHaveBeenCalledOnce();
  });
});
