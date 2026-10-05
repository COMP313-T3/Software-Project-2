import { createHash } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DEFAULT_PASSWORD_RESET_LIMITS } from "../src/config/env.js";
import { LoginThrottle } from "../src/models/LoginThrottle.js";
import { PasswordResetToken } from "../src/models/PasswordResetToken.js";
import { RefreshToken } from "../src/models/RefreshToken.js";
import { User } from "../src/models/User.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/services/passwordService.js";
import { backgroundTasksDone } from "../src/utils/backgroundTasks.js";

const FORGOT_PATH = "/api/auth/forgot-password";
const CHECK_PATH = "/api/auth/reset-password/check";
const RESET_PATH = "/api/auth/reset-password";
const OLD_PASSWORD = "Chalk up & send it";
const NEW_PASSWORD = "Crimp hard 2 the top";
const LINK_PATTERN =
  /^http:\/\/localhost:5173\/reset-password\?token=([\w-]{43})$/m;
const LINK_INVALID = {
  error: "RESET_LINK_INVALID",
  message:
    "This reset link has expired or was already used. Ask for a new one.",
};

let users;
let links;
let mailer;

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) =>
    key === "_id" ? document._id.equals(value) : document[key] === value,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  users = [];
  links = [];
  mailer = { sent: [], send: vi.fn(async (email) => mailer.sent.push(email)) };

  vi.spyOn(User, "findOne").mockImplementation(
    async (filter) => users.find((user) => matches(user, filter)) ?? null,
  );
  vi.spyOn(User, "updateOne").mockImplementation(async (filter, update) => {
    const user = users.find((candidate) => matches(candidate, filter));
    if (user) Object.assign(user, update.$set);
    return { matchedCount: user ? 1 : 0 };
  });
  vi.spyOn(PasswordResetToken, "create").mockImplementation(async (details) => {
    const link = new PasswordResetToken(details);
    await link.validate();
    links.push(link);
    return link;
  });
  vi.spyOn(PasswordResetToken, "findOne").mockImplementation(
    async (filter) => links.find((link) => matches(link, filter)) ?? null,
  );
  vi.spyOn(PasswordResetToken, "findOneAndDelete").mockImplementation(
    async (filter) => {
      const index = links.findIndex((link) => matches(link, filter));
      return index === -1 ? null : links.splice(index, 1)[0];
    },
  );
  vi.spyOn(PasswordResetToken, "deleteMany").mockImplementation(
    async ({ user }) => {
      links = links.filter((link) => !link.user.equals(user));
    },
  );
  vi.spyOn(RefreshToken, "deleteMany").mockResolvedValue({ deletedCount: 0 });
  vi.spyOn(LoginThrottle, "deleteOne").mockResolvedValue({ deletedCount: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function addClimber(details = {}) {
  const user = new User({
    firstName: "Jordan",
    lastName: "Sendwell",
    email: "jordan@example.com",
    passwordHash: await hashPassword(OLD_PASSWORD),
    role: "CLIMBER",
    ...details,
  });
  users.push(user);
  return user;
}

function makeApp(options = {}) {
  return createApp({
    clientOrigins: ["http://localhost:5173"],
    mailer,
    ...options,
  });
}

async function askForLink(app, email = "jordan@example.com") {
  const response = await request(app).post(FORGOT_PATH).send({ email });
  await backgroundTasksDone();
  return response;
}

function tokenFrom(email) {
  return LINK_PATTERN.exec(email.text)[1];
}

async function tokenFor(app, email) {
  await askForLink(app, email);
  return tokenFrom(mailer.sent.at(-1));
}

describe("POST /api/auth/forgot-password", () => {
  it("emails a one-hour link and stores only a hash of its token", async () => {
    await addClimber({ firstName: "Jo<b>" });
    const before = Date.now();

    const response = await askForLink(makeApp(), "  Jordan@Example.com ");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: "requested" });
    expect(mailer.sent).toHaveLength(1);
    const [email] = mailer.sent;
    expect(email.to).toBe("jordan@example.com");
    expect(email.subject).toBe("Reset your TopSend password");
    expect(email.text).toMatch(LINK_PATTERN);
    expect(email.html).toContain("Hi Jo&lt;b&gt;,");
    expect(email.html).not.toContain("Jo<b>");

    const token = tokenFrom(email);
    expect(links).toHaveLength(1);
    expect(links[0].tokenHash).toBe(sha256(token));
    expect(links[0].user.equals(users[0]._id)).toBe(true);
    const lifetime = links[0].expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(lifetime).toBeLessThan(60 * 60 * 1000 + 5_000);
  });

  it("answers the same way for an email with no account, and sends nothing", async () => {
    await addClimber({ email: "someone@example.com" });
    await addClimber({ email: "closed@example.com", isActive: false });
    const app = makeApp();

    for (const email of ["nobody@example.com", "closed@example.com"]) {
      const response = await askForLink(app, email);
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: "requested" });
    }
    expect(mailer.sent).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  it("answers before looking up the account", async () => {
    let finishLookup;
    User.findOne.mockImplementationOnce(
      () => new Promise((resolve) => (finishLookup = () => resolve(null))),
    );

    const response = await request(makeApp())
      .post(FORGOT_PATH)
      .send({ email: "jordan@example.com" });

    expect(response.status).toBe(202);
    finishLookup();
    await backgroundTasksDone();
  });

  it("logs an email that couldn't be sent without changing the answer", async () => {
    await addClimber();
    mailer.send.mockRejectedValueOnce(new Error("Invalid login"));

    const response = await askForLink(makeApp());

    expect(response.status).toBe(202);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Password reset email failed"'),
    );
  });

  it("rejects an email that isn't valid without looking it up", async () => {
    const response = await askForLink(makeApp(), "jordan@");

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({
      email: "Enter an email address like name@example.com.",
    });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("answers 503 when email is off", async () => {
    const response = await askForLink(makeApp({ mailer: null }));

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "EMAIL_UNAVAILABLE",
      message:
        "Password reset isn't available right now. Please try again later.",
    });
  });

  it("allows 3 requests per email per hour, counting each email on its own", async () => {
    const app = makeApp();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect((await askForLink(app, "jordan@example.com")).status).toBe(202);
    }

    const blocked = await askForLink(app, "JORDAN@example.com");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "TOO_MANY_REQUESTS",
      message:
        "Too many reset requests for this email. Please try again later.",
    });
    expect((await askForLink(app, "alex@example.com")).status).toBe(202);
  });

  it("keeps the per-email count out of the headers, since it includes other people's requests", async () => {
    const app = makeApp();
    const responses = [];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      responses.push(await askForLink(app));
    }

    for (const response of responses) {
      expect(response.headers["ratelimit-policy"]).toMatch(/^"30-in-1hr"/);
      expect(response.headers["ratelimit-policy"]).not.toContain("3-in-1hr");
    }
    expect(responses[3].status).toBe(429);
    expect(responses[3].headers["retry-after"]).toBeUndefined();
  });

  it("limits requests per IP address", async () => {
    const app = makeApp({
      passwordResetLimits: {
        ...DEFAULT_PASSWORD_RESET_LIMITS,
        requestsPerIpPerHour: 2,
      },
    });
    await askForLink(app, "a@example.com");
    await askForLink(app, "b@example.com");

    const blocked = await askForLink(app, "c@example.com");

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many reset requests. Please try again later.",
    );
  });
});

describe("POST /api/auth/reset-password/check", () => {
  it("returns the email of the account a working link resets", async () => {
    await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");

    const response = await request(app).post(CHECK_PATH).send({ token });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ email: "jordan@example.com" });
    expect(links).toHaveLength(1);
  });

  it("rejects an unknown link, an expired one, and one for a closed account", async () => {
    const user = await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");

    const unknown = await request(app)
      .post(CHECK_PATH)
      .send({ token: "x".repeat(43) });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual(LINK_INVALID);

    links[0].expiresAt = new Date(Date.now() - 1000);
    const expired = await request(app).post(CHECK_PATH).send({ token });
    expect(expired.body).toEqual(LINK_INVALID);

    links[0].expiresAt = new Date(Date.now() + 60_000);
    user.isActive = false;
    const closed = await request(app).post(CHECK_PATH).send({ token });
    expect(closed.body).toEqual(LINK_INVALID);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password and makes every link of the account stop working", async () => {
    const user = await addClimber();
    await addClimber({ email: "alex@example.com" });
    const app = makeApp();
    const older = await tokenFor(app, "jordan@example.com");
    const token = await tokenFor(app, "jordan@example.com");
    await tokenFor(app, "alex@example.com");

    const response = await request(app)
      .post(RESET_PATH)
      .send({ token, password: NEW_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "reset" });
    expect(await verifyPassword(user.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(user.passwordHash, OLD_PASSWORD)).toBe(false);
    expect(links).toHaveLength(1);
    expect(links[0].user.equals(users[1]._id)).toBe(true);

    for (const used of [token, older]) {
      const again = await request(app)
        .post(RESET_PATH)
        .send({ token: used, password: "Another one 4 me" });
      expect(again.body).toEqual(LINK_INVALID);
    }
  });

  it("logs the account out everywhere and lifts a lock from failed logins", async () => {
    const user = await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");

    await request(app)
      .post(RESET_PATH)
      .send({ token, password: NEW_PASSWORD })
      .expect(200);

    expect(RefreshToken.deleteMany).toHaveBeenCalledWith({ user: user._id });
    expect(LoginThrottle.deleteOne).toHaveBeenCalledWith({
      emailHash: sha256("jordan@example.com"),
    });
  });

  it("checks the new password with the sign-up rules and keeps the link", async () => {
    await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");

    const response = await request(app)
      .post(RESET_PATH)
      .send({ token, password: "alllowercase1" });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({
      password: "Add an uppercase letter.",
    });
    expect(links).toHaveLength(1);
  });

  it("lets only one of two saves made at the same time use the link", async () => {
    const user = await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");

    const responses = await Promise.all(
      [NEW_PASSWORD, "Another one 4 me"].map((password) =>
        request(app).post(RESET_PATH).send({ token, password }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    const saved = responses.find((response) => response.status === 200);
    const password = saved === responses[0] ? NEW_PASSWORD : "Another one 4 me";
    expect(await verifyPassword(user.passwordHash, password)).toBe(true);
    expect(responses.find((response) => response.status === 400).body).toEqual(
      LINK_INVALID,
    );
  });

  it("rejects a link for an account closed after the email was sent", async () => {
    const user = await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");
    user.isActive = false;

    const response = await request(app)
      .post(RESET_PATH)
      .send({ token, password: NEW_PASSWORD });

    expect(response.body).toEqual(LINK_INVALID);
    expect(await verifyPassword(user.passwordHash, OLD_PASSWORD)).toBe(true);
  });

  it("rejects an expired link", async () => {
    const user = await addClimber();
    const app = makeApp();
    const token = await tokenFor(app, "jordan@example.com");
    links[0].expiresAt = new Date(Date.now() - 1000);

    const response = await request(app)
      .post(RESET_PATH)
      .send({ token, password: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(LINK_INVALID);
    expect(await verifyPassword(user.passwordHash, OLD_PASSWORD)).toBe(true);
  });

  it("limits link checks and new passwords per IP address together", async () => {
    const app = makeApp({
      passwordResetLimits: {
        ...DEFAULT_PASSWORD_RESET_LIMITS,
        linkTriesPerIpPerHour: 2,
      },
    });
    const token = "x".repeat(43);
    await request(app).post(CHECK_PATH).send({ token });
    await request(app).post(RESET_PATH).send({ token, password: NEW_PASSWORD });

    const blocked = await request(app).post(CHECK_PATH).send({ token });

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe(
      "Too many tries. Please try again later.",
    );
  });
});
