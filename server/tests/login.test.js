import { createHash } from "node:crypto";
import { decodeJwt } from "jose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DEFAULT_LOGIN_LIMITS } from "../src/config/env.js";
import { LoginThrottle } from "../src/models/LoginThrottle.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { User } from "../src/models/User.js";
import { hashPassword } from "../src/services/passwordService.js";

const PASSWORD = "Chalk up & send it";
const START = new Date("2026-10-05T14:00:00Z");
const MINUTE_MS = 60 * 1000;
const NO_DELAYS = { ...DEFAULT_LOGIN_LIMITS, failureDelaysMs: [0] };
const INVALID_CREDENTIALS = {
  error: "INVALID_CREDENTIALS",
  message: "Email or password is incorrect.",
};
const SESSION_EXPIRED = {
  error: "SESSION_EXPIRED",
  message: "Your session expired. Log in again to continue.",
};
const NOT_AUTHENTICATED = {
  error: "NOT_AUTHENTICATED",
  message: "Log in to continue.",
};

let users;
let sessions;
let throttles;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function same(actual, expected) {
  if (Array.isArray(actual)) return actual.includes(expected);
  if (actual instanceof Date) {
    return expected instanceof Date && actual.getTime() === expected.getTime();
  }
  if (actual && typeof actual === "object" && "equals" in actual) {
    return String(actual) === String(expected);
  }
  return actual === expected;
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) =>
    same(document[key], value),
  );
}

function applyUpdate(document, update) {
  for (const [field, value] of Object.entries(update.$set ?? {})) {
    document[field] = value;
  }
  for (const [field, value] of Object.entries(update.$inc ?? {})) {
    document[field] = (document[field] ?? 0) + value;
  }
  for (const [field, value] of Object.entries(update.$max ?? {})) {
    if (!(document[field] >= value)) document[field] = value;
  }
  for (const [field, value] of Object.entries(update.$push ?? {})) {
    const list = [...(document[field] ?? [])];
    list.splice(value.$position ?? list.length, 0, ...value.$each);
    document[field] = list.slice(0, value.$slice ?? list.length);
  }
}

function inMemory(Model, documents) {
  const remove = (filter) => {
    const index = documents.findIndex((document) => matches(document, filter));
    return index === -1 ? null : documents.splice(index, 1)[0];
  };

  vi.spyOn(Model, "create").mockImplementation(async (details) => {
    const document = new Model(details);
    await document.validate();
    documents.push(document);
    return document;
  });
  vi.spyOn(Model, "findOne").mockImplementation(
    async (filter) =>
      documents.find((document) => matches(document, filter)) ?? null,
  );
  vi.spyOn(Model, "findOneAndUpdate").mockImplementation(
    async (filter, update, options = {}) => {
      let document = documents.find((candidate) => matches(candidate, filter));
      if (!document) {
        if (!options.upsert) return null;
        document = new Model({ ...filter, ...update.$setOnInsert });
        documents.push(document);
      }
      applyUpdate(document, update);
      return document;
    },
  );
  vi.spyOn(Model, "updateOne").mockImplementation(async (filter, update) => {
    const document = documents.find((candidate) => matches(candidate, filter));
    if (document) applyUpdate(document, update);
    return { matchedCount: document ? 1 : 0 };
  });
  vi.spyOn(Model, "findOneAndDelete").mockImplementation(async (filter) =>
    remove(filter),
  );
  vi.spyOn(Model, "deleteOne").mockImplementation(async (filter) => ({
    deletedCount: remove(filter) ? 1 : 0,
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  users = [];
  sessions = [];
  throttles = [];
  vi.spyOn(User, "findOne").mockImplementation(
    async (filter) => users.find((user) => matches(user, filter)) ?? null,
  );
  inMemory(RefreshToken, sessions);
  inMemory(LoginThrottle, throttles);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function addClimber(details = {}) {
  const user = new User({
    firstName: "Jordan",
    lastName: "Sendwell",
    email: "jordan@example.com",
    passwordHash: await hashPassword(PASSWORD),
    role: "CLIMBER",
    ...details,
  });
  users.push(user);
  return user;
}

function makeApp(options = {}) {
  return createApp({
    clientOrigins: ["http://localhost:5173"],
    loginLimits: NO_DELAYS,
    ...options,
  });
}

function later(minutes) {
  vi.setSystemTime(Date.now() + minutes * MINUTE_MS);
}

function cookie(response, name) {
  const header = (response.headers["set-cookie"] ?? []).find((line) =>
    line.startsWith(`${name}=`),
  );
  if (!header) return null;
  const [pair, ...attributes] = header.split("; ");
  return { value: pair.slice(name.length + 1), attributes };
}

async function csrfToken(agent) {
  const response = await agent.get("/api/auth/csrf").expect(200);
  return response.body.csrfToken;
}

async function logIn(agent, email = "jordan@example.com", password = PASSWORD) {
  const token = await csrfToken(agent);
  return agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", token)
    .send({ email, password });
}

async function refresh(agent) {
  const token = await csrfToken(agent);
  return agent.post("/api/auth/refresh").set("X-CSRF-Token", token);
}

function me(app, accessToken) {
  return request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${accessToken}`);
}

function ping(app, accessToken, body = {}) {
  return request(app)
    .post("/api/session/ping")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(body);
}

describe("POST /api/auth/login", () => {
  it("answers an access token and sets a refresh cookie whose secret is stored only as a hash", async () => {
    const user = await addClimber();
    const agent = request.agent(makeApp());

    const response = await logIn(agent);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      "expiresAt",
      "role",
      "token",
      "userId",
    ]);
    expect(response.body).toMatchObject({ userId: user.id, role: "CLIMBER" });
    expect(response.body.expiresAt).toBe(
      new Date(START.getTime() + 15 * MINUTE_MS).toISOString(),
    );
    expect(decodeJwt(response.body.token)).toMatchObject({
      sub: user.id,
      role: "CLIMBER",
      sid: sessions[0].id,
      iss: "topsend-api",
      aud: "topsend-web",
    });

    const refreshCookie = cookie(response, "topsend.refresh");
    expect(refreshCookie.attributes).toEqual(
      expect.arrayContaining([
        "Max-Age=43200",
        "Path=/api/auth",
        "HttpOnly",
        "SameSite=Strict",
      ]),
    );
    expect(refreshCookie.attributes).not.toContain("Secure");
    const [sessionId, secret] = refreshCookie.value.split(".");
    expect(sessionId).toBe(sessions[0].id);
    expect(sessions[0].tokenHash).toBe(sha256(secret));
    expect(JSON.stringify(sessions[0].toObject())).not.toContain(secret);
  });

  it("answers the same way for a wrong password, an email with no account, and a turned off account", async () => {
    await addClimber();
    await addClimber({ email: "closed@example.com", isActive: false });
    const app = makeApp();

    for (const [email, password] of [
      ["jordan@example.com", "Not my password 1"],
      ["nobody@example.com", PASSWORD],
      ["closed@example.com", PASSWORD],
    ]) {
      const response = await logIn(request.agent(app), email, password);
      expect(response.status).toBe(401);
      expect(response.body).toEqual(INVALID_CREDENTIALS);
      expect(cookie(response, "topsend.refresh")).toBeNull();
    }
    expect(sessions).toHaveLength(0);
  });

  it("trims and lowercases the email", async () => {
    await addClimber();

    const response = await logIn(
      request.agent(makeApp()),
      "  Jordan@Example.COM ",
    );

    expect(response.status).toBe(200);
  });

  it("checks the body before looking anything up", async () => {
    await addClimber();

    const response = await logIn(request.agent(makeApp()), "jordan@", "");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "VALIDATION_ERROR",
      fields: {
        email: "Enter an email address like name@example.com.",
        password: "Enter your password.",
      },
    });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("needs the CSRF token from GET /api/auth/csrf", async () => {
    await addClimber();
    const agent = request.agent(makeApp());
    await csrfToken(agent);

    for (const header of [undefined, "made-up-token"]) {
      const attempt = agent
        .post("/api/auth/login")
        .send({ email: "jordan@example.com", password: PASSWORD });
      const response = await (header
        ? attempt.set("X-CSRF-Token", header)
        : attempt);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("CSRF_INVALID");
    }
    expect(sessions).toHaveLength(0);
  });

  it("says whether the browser sent a refresh cookie, so the page knows when to try refreshing", async () => {
    await addClimber();
    const agent = request.agent(makeApp());

    expect((await agent.get("/api/auth/csrf")).body.sessionCookie).toBe(false);
    await logIn(agent);
    expect((await agent.get("/api/auth/csrf")).body.sessionCookie).toBe(true);
  });

  it("sets the CSRF cookie as HttpOnly and SameSite=Strict for the whole site", async () => {
    const response = await request(makeApp()).get("/api/auth/csrf");

    expect(cookie(response, "topsend.csrf")).toEqual({
      value: response.body.csrfToken,
      attributes: expect.arrayContaining([
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
      ]),
    });
  });

  it("uses Secure cookies with name prefixes in production", async () => {
    await addClimber();
    const app = makeApp({ secureCookies: true });
    const csrf = await request(app).get("/api/auth/csrf");
    const token = csrf.body.csrfToken;

    const response = await request(app)
      .post("/api/auth/login")
      .set("Cookie", `__Host-topsend.csrf=${token}`)
      .set("X-CSRF-Token", token)
      .send({ email: "jordan@example.com", password: PASSWORD });

    expect(response.status).toBe(200);
    expect(cookie(csrf, "__Host-topsend.csrf").attributes).toContain("Secure");
    expect(cookie(response, "__Secure-topsend.refresh").attributes).toEqual(
      expect.arrayContaining(["Secure", "HttpOnly", "Path=/api/auth"]),
    );
  });

  it("turns away a login sent from another site", async () => {
    await addClimber();
    const agent = request.agent(makeApp());
    const token = await csrfToken(agent);

    const response = await agent
      .post("/api/auth/login")
      .set("Origin", "https://elsewhere.example")
      .set("X-CSRF-Token", token)
      .send({ email: "jordan@example.com", password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("locks the email for 15 minutes after 10 failures, even for the right password", async () => {
    await addClimber();
    const app = makeApp();

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await logIn(
        request.agent(app),
        "jordan@example.com",
        "Wrong guess 123",
      );
      expect(response.body).toEqual(INVALID_CREDENTIALS);
    }
    const locked = await logIn(request.agent(app));

    expect(locked.status).toBe(429);
    expect(locked.body).toEqual({
      error: "LOGIN_LOCKED",
      message: "Too many failed attempts. Try again in 15 minutes.",
    });
    expect(locked.headers["retry-after"]).toBe("900");
    expect(throttles[0].emailHash).toBe(sha256("jordan@example.com"));
    expect(JSON.stringify(throttles[0].toObject())).not.toContain("jordan");

    later(14);
    expect((await logIn(request.agent(app))).body.message).toBe(
      "Too many failed attempts. Try again in 1 minute.",
    );

    later(1);
    expect((await logIn(request.agent(app))).status).toBe(200);
  });

  it("doesn't let many attempts at once get past the lock", async () => {
    await addClimber();
    const app = makeApp();

    const responses = await Promise.all(
      Array.from({ length: 15 }, () =>
        logIn(request.agent(app), "jordan@example.com", "Wrong guess 123"),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
    expect((await logIn(request.agent(app))).body.error).toBe("LOGIN_LOCKED");
  });

  it("locks an email with no account the same way", async () => {
    const app = makeApp();

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await logIn(request.agent(app), "nobody@example.com");
    }

    expect(
      (await logIn(request.agent(app), "nobody@example.com")).body.error,
    ).toBe("LOGIN_LOCKED");
  });

  it("only counts failures within 15 minutes of the first one", async () => {
    await addClimber();
    const app = makeApp();
    const fail = () =>
      logIn(request.agent(app), "jordan@example.com", "Wrong guess 123");

    for (let attempt = 1; attempt <= 9; attempt += 1) await fail();
    later(16);
    await fail();

    expect((await logIn(request.agent(app))).status).toBe(200);
  });

  it("starts counting again after a successful login", async () => {
    await addClimber();
    const app = makeApp();
    const fail = () =>
      logIn(request.agent(app), "jordan@example.com", "Wrong guess 123");

    for (let attempt = 1; attempt <= 9; attempt += 1) await fail();
    expect((await logIn(request.agent(app))).status).toBe(200);
    for (let attempt = 1; attempt <= 9; attempt += 1) await fail();

    expect((await logIn(request.agent(app))).status).toBe(200);
  });

  it("waits longer before answering as failures add up", async () => {
    await addClimber();
    const app = makeApp({
      loginLimits: { ...DEFAULT_LOGIN_LIMITS, failureDelaysMs: [0, 0, 120] },
    });
    const timeFailure = async () => {
      const startedAt = performance.now();
      await logIn(request.agent(app), "jordan@example.com", "Wrong guess 123");
      return performance.now() - startedAt;
    };

    await timeFailure();
    await timeFailure();

    expect(await timeFailure()).toBeGreaterThanOrEqual(110);
  });

  it("limits failed logins per IP address, without counting successful ones", async () => {
    await addClimber();
    const app = makeApp({
      loginLimits: { ...NO_DELAYS, failuresPerIpPer15Minutes: 3 },
    });

    expect((await logIn(request.agent(app))).status).toBe(200);
    expect((await logIn(request.agent(app))).status).toBe(200);
    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      expect((await logIn(request.agent(app), email)).status).toBe(401);
    }
    const limited = await logIn(request.agent(app));

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: "TOO_MANY_REQUESTS",
      message:
        "Too many failed logins from this network. Please try again later.",
    });
  });
});

describe("POST /api/auth/refresh", () => {
  it("swaps the refresh cookie for a new one and answers a new access token", async () => {
    const user = await addClimber();
    const agent = request.agent(makeApp());
    const first = cookie(await logIn(agent), "topsend.refresh").value;
    later(10);

    const response = await refresh(agent);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: user.id, role: "CLIMBER" });
    expect(decodeJwt(response.body.token).sid).toBe(sessions[0].id);
    const second = cookie(response, "topsend.refresh").value;
    expect(second).not.toBe(first);
    expect(second.split(".")[0]).toBe(first.split(".")[0]);
    expect(sessions[0].tokenHash).toBe(sha256(second.split(".")[1]));
  });

  it("ends the session when an old refresh cookie is used again", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    const old = cookie(await logIn(agent), "topsend.refresh").value;
    expect((await refresh(agent)).status).toBe(200);
    const token = await csrfToken(agent);
    later(1);

    const reused = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `topsend.refresh=${old}; topsend.csrf=${token}`)
      .set("X-CSRF-Token", token);

    expect(reused.status).toBe(401);
    expect(reused.body).toEqual(SESSION_EXPIRED);
    expect(sessions).toHaveLength(0);
    expect((await refresh(agent)).body).toEqual(SESSION_EXPIRED);
  });

  it("lets the cookie a refresh just replaced try again for 30 seconds, as after a reload cut the refresh off", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    const lost = cookie(await logIn(agent), "topsend.refresh").value;
    await refresh(agent);
    const token = await csrfToken(agent);
    later(0.4);

    const retried = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `topsend.refresh=${lost}; topsend.csrf=${token}`)
      .set("X-CSRF-Token", token);

    expect(retried.status).toBe(200);
    const fresh = cookie(retried, "topsend.refresh").value;
    expect(fresh.split(".")[0]).toBe(lost.split(".")[0]);
    expect(sessions[0].tokenHash).toBe(sha256(fresh.split(".")[1]));
  });

  it("leaves a session alone when a refresh cookie it never had names it", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    const real = cookie(await logIn(agent), "topsend.refresh").value;
    const madeUp = `${real.split(".")[0]}.${"A".repeat(43)}`;
    const token = await csrfToken(agent);
    const withMadeUp = (path) =>
      request(app)
        .post(path)
        .set("Cookie", `topsend.refresh=${madeUp}; topsend.csrf=${token}`)
        .set("X-CSRF-Token", token);

    expect((await withMadeUp("/api/auth/refresh")).body).toEqual(
      SESSION_EXPIRED,
    );
    expect((await withMadeUp("/api/auth/logout")).status).toBe(204);

    expect(sessions).toHaveLength(1);
    expect((await refresh(agent)).status).toBe(200);
  });

  it("answers 401 NOT_AUTHENTICATED without a refresh cookie", async () => {
    const response = await refresh(request.agent(makeApp()));

    expect(response.status).toBe(401);
    expect(response.body).toEqual(NOT_AUTHENTICATED);
  });

  it("needs the CSRF token", async () => {
    await addClimber();
    const agent = request.agent(makeApp());
    await logIn(agent);

    const response = await agent.post("/api/auth/refresh");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("CSRF_INVALID");
  });

  it("ends a session after 60 minutes without activity and deletes its cookies", async () => {
    await addClimber();
    const agent = request.agent(makeApp());
    await logIn(agent);
    later(60);

    const response = await refresh(agent);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(SESSION_EXPIRED);
    expect(cookie(response, "topsend.refresh").attributes).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    expect(sessions).toHaveLength(0);
  });

  it("doesn't count refreshing as activity", async () => {
    await addClimber();
    const agent = request.agent(makeApp());
    await logIn(agent);
    later(50);
    expect((await refresh(agent)).status).toBe(200);

    later(11);

    expect((await refresh(agent)).body).toEqual(SESSION_EXPIRED);
  });

  it("keeps an active session going, but never past 12 hours after logging in", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    await logIn(agent);
    let response;

    for (let hour = 1; hour <= 14; hour += 1) {
      later(50);
      response = await refresh(agent);
      expect((await ping(app, response.body.token)).status).toBe(200);
    }
    const last = cookie(response, "topsend.refresh");
    const token = await csrfToken(agent);
    later(21);

    expect(last.attributes).toContain(`Max-Age=${20 * 60}`);
    const expired = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `topsend.refresh=${last.value}; topsend.csrf=${token}`)
      .set("X-CSRF-Token", token);
    expect(expired.body).toEqual(SESSION_EXPIRED);
  });

  it("ends the session when the account was turned off", async () => {
    const user = await addClimber();
    const agent = request.agent(makeApp());
    await logIn(agent);
    user.isActive = false;

    expect((await refresh(agent)).body).toEqual(SESSION_EXPIRED);
    expect(sessions).toHaveLength(0);
  });
});

describe("POST /api/auth/logout", () => {
  it("ends the session and deletes both cookies", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    const { body } = await logIn(agent);
    const token = await csrfToken(agent);

    const response = await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", token);

    expect(response.status).toBe(204);
    for (const name of ["topsend.refresh", "topsend.csrf"]) {
      expect(cookie(response, name)).toMatchObject({
        value: "",
        attributes: expect.arrayContaining([
          "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        ]),
      });
    }
    expect(sessions).toHaveLength(0);
    expect((await refresh(agent)).body).toEqual(NOT_AUTHENTICATED);
    expect((await me(app, body.token)).body).toEqual(SESSION_EXPIRED);
  });

  it("answers 204 when there was no session", async () => {
    const agent = request.agent(makeApp());
    const token = await csrfToken(agent);

    await agent.post("/api/auth/logout").set("X-CSRF-Token", token).expect(204);
  });

  it("needs the CSRF token", async () => {
    await addClimber();
    const agent = request.agent(makeApp());
    await logIn(agent);

    const response = await agent.post("/api/auth/logout");

    expect(response.status).toBe(403);
    expect(sessions).toHaveLength(1);
  });
});

describe("GET /api/auth/me", () => {
  it("answers who is logged in and how long the session has left", async () => {
    const user = await addClimber();
    const app = makeApp();
    const { body } = await logIn(request.agent(app));

    const response = await me(app, body.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: user.id,
      email: "jordan@example.com",
      role: "CLIMBER",
      session: { expiresIn: 3600, limitReached: false },
    });
  });

  it("needs a valid access token from this API", async () => {
    await addClimber();
    const app = makeApp();
    const { body } = await logIn(request.agent(app));
    const otherApp = makeApp();
    const otherToken = (await logIn(request.agent(otherApp))).body.token;

    expect((await request(app).get("/api/auth/me")).body).toEqual(
      NOT_AUTHENTICATED,
    );
    for (const token of ["not-a-token", otherToken, `${body.token}x`]) {
      expect((await me(app, token)).body).toEqual(NOT_AUTHENTICATED);
    }
  });

  it("asks for a refresh once the access token is 15 minutes old", async () => {
    await addClimber();
    const app = makeApp();
    const { body } = await logIn(request.agent(app));
    later(15);

    const response = await me(app, body.token);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("TOKEN_EXPIRED");
  });

  it("counts requests as activity", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    await logIn(agent);
    later(50);
    const { body } = await refresh(agent);
    expect((await me(app, body.token)).body.session.expiresIn).toBe(3600);

    later(50);

    expect((await refresh(agent)).status).toBe(200);
  });
});

describe("POST /api/session/ping", () => {
  it("records the last activity from idleSeconds and answers the time left", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    await logIn(agent);
    later(30);
    const { body } = await refresh(agent);

    const response = await ping(app, body.token, { idleSeconds: 600 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ expiresIn: 50 * 60, limitReached: false });
    expect(sessions[0].lastActiveAt).toEqual(
      new Date(START.getTime() + 20 * MINUTE_MS),
    );
  });

  it("records a keep-alive even right after other activity", async () => {
    await addClimber();
    const app = makeApp();
    const { body } = await logIn(request.agent(app));
    later(0.5);

    const response = await ping(app, body.token);

    expect(response.body.expiresIn).toBe(3600);
    expect(sessions[0].lastActiveAt).toEqual(
      new Date(START.getTime() + 0.5 * MINUTE_MS),
    );
  });

  it("never moves the last activity back, so checking in can't extend an idle session", async () => {
    await addClimber();
    const app = makeApp();
    const agent = request.agent(app);
    await logIn(agent);
    later(30);
    const { body } = await refresh(agent);

    const response = await ping(app, body.token, { idleSeconds: 3000 });

    expect(response.body.expiresIn).toBe(30 * 60);
    expect(sessions[0].lastActiveAt).toEqual(START);
  });

  it("says when the hard limit is reached, so activity can't extend the session", async () => {
    await addClimber();
    const app = makeApp({ session: { idleMinutes: 60, absoluteHours: 2 } });
    const agent = request.agent(app);
    await logIn(agent);
    later(55);
    await ping(app, (await refresh(agent)).body.token);
    later(35);

    const response = await ping(app, (await refresh(agent)).body.token);

    expect(response.body).toEqual({ expiresIn: 30 * 60, limitReached: true });
  });

  it("checks idleSeconds and needs the access token", async () => {
    await addClimber();
    const app = makeApp();
    const { body } = await logIn(request.agent(app));

    for (const idleSeconds of [-1, 1.5, "60"]) {
      const response = await ping(app, body.token, { idleSeconds });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    }
    expect((await request(app).post("/api/session/ping")).body).toEqual(
      NOT_AUTHENTICATED,
    );
  });
});
