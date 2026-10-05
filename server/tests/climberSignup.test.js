import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { verifyPassword } from "../src/services/passwordService.js";

const SIGNUP_PATH = "/api/users/climbers";
const SECRET_KEY = "secret-key-for-tests";
const PASSWORD = "Chalk up & send it";
const EMAIL_TAKEN_MESSAGE =
  "This email already has an account. Try logging in.";

let savedUsers;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  savedUsers = [];
  vi.spyOn(User, "exists").mockImplementation(async ({ email }) =>
    savedUsers.some((user) => user.email === email) ? { _id: "taken" } : null,
  );
  vi.spyOn(User, "create").mockImplementation(async (details) => {
    const user = new User(details);
    await user.validate();
    savedUsers.push(user);
    return user;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeApp(options = {}) {
  return createApp({
    clientOrigins: ["http://localhost:5173"],
    recaptchaSecretKey: SECRET_KEY,
    ...options,
  });
}

function signupBody(overrides = {}) {
  return {
    firstName: "Jordan",
    lastName: "Sendwell",
    email: "jordan@example.com",
    password: PASSWORD,
    dateOfBirth: "2000-05-17",
    gender: "FEMALE",
    phone: "416 555 0123",
    address: "123 Queen St W, Toronto, ON",
    postalCode: "m5h 2n2",
    country: "CA",
    acceptedTerms: true,
    recaptchaToken: "token-from-the-browser",
    ...overrides,
  };
}

function googleAnswers(verdict) {
  const fetchMock = vi.fn(async () => Response.json(verdict));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fieldErrorsFor(overrides) {
  googleAnswers({ success: true });
  const response = await request(makeApp())
    .post(SIGNUP_PATH)
    .send(signupBody(overrides));
  expect(response.status).toBe(400);
  expect(savedUsers).toHaveLength(0);
  return response.body.fields;
}

function todayInTorontoIs(isoMoment) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoMoment));
}

describe("POST /api/users/climbers", () => {
  it("creates a climber account and stores only an argon2id hash of the password", async () => {
    googleAnswers({ success: true });

    const response = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(
        signupBody({
          firstName: "  Jordan ",
          email: "  Jordan@Example.com ",
          role: "ADMIN",
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      userId: savedUsers[0].id,
      status: "created",
      role: "CLIMBER",
    });
    expect(savedUsers[0]).toMatchObject({
      firstName: "Jordan",
      lastName: "Sendwell",
      email: "jordan@example.com",
      role: "CLIMBER",
      isActive: true,
      dateOfBirth: new Date("2000-05-17T00:00:00.000Z"),
      gender: "FEMALE",
      phone: "416 555 0123",
      address: "123 Queen St W, Toronto, ON",
      postalCode: "M5H 2N2",
      country: "CA",
      termsVersion: "1.0",
    });
    expect(savedUsers[0].termsAcceptedAt).toBeInstanceOf(Date);
    expect(savedUsers[0].location).toBeUndefined();

    const { passwordHash } = savedUsers[0];
    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(passwordHash).not.toContain(PASSWORD);
    expect(await verifyPassword(passwordHash, PASSWORD)).toBe(true);
  });

  it("saves a map pin as a GeoJSON point", async () => {
    googleAnswers({ success: true });

    const response = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody({ location: { lat: 43.6487, lng: -79.3854 } }));

    expect(response.status).toBe(201);
    expect(savedUsers[0].location.toObject()).toEqual({
      type: "Point",
      coordinates: [-79.3854, 43.6487],
    });
  });

  it("asks Google to check the token with the secret key", async () => {
    const fetchMock = googleAnswers({ success: true });

    await request(makeApp()).post(SIGNUP_PATH).send(signupBody());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(options.method).toBe("POST");
    expect(options.body.get("secret")).toBe(SECRET_KEY);
    expect(options.body.get("response")).toBe("token-from-the-browser");
  });

  it("rejects an email that already has an account, whatever its letter case", async () => {
    googleAnswers({ success: true });
    const app = makeApp();
    await request(app).post(SIGNUP_PATH).send(signupBody());

    const response = await request(app)
      .post(SIGNUP_PATH)
      .send(signupBody({ email: "JORDAN@example.com" }));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "EMAIL_TAKEN",
      message: EMAIL_TAKEN_MESSAGE,
      fields: { email: EMAIL_TAKEN_MESSAGE },
    });
    expect(savedUsers).toHaveLength(1);
  });

  it("gives the same answer when two sign-ups with one email arrive together", async () => {
    googleAnswers({ success: true });
    User.create.mockRejectedValue(
      Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }),
    );

    const response = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("EMAIL_TAKEN");
  });

  it("explains every field that needs fixing without asking Google", async () => {
    const fetchMock = googleAnswers({ success: true });

    const response = await request(makeApp()).post(SIGNUP_PATH).send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "VALIDATION_ERROR",
      message: "Check the fields and try again.",
      fields: {
        firstName: "Enter your first name.",
        lastName: "Enter your last name.",
        email: "Enter your email.",
        password: "Enter your password.",
        dateOfBirth: "Enter your date of birth.",
        gender: "Choose an option.",
        phone: "Enter your phone number.",
        address: "Enter your address.",
        postalCode: "Enter your postal code.",
        country: "Choose your country.",
        acceptedTerms: "Agree to the Terms and Privacy Policy to continue.",
        recaptchaToken: "Check the box to show you're not a robot.",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  it("blocks a sign-up that filled in the hidden website field", async () => {
    const fetchMock = googleAnswers({ success: true });

    const response = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody({ website: "https://spam.example" }));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "SIGNUP_REJECTED",
      message:
        "We couldn't create your account. Refresh the page and try again.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  it("rejects a token that Google doesn't accept", async () => {
    googleAnswers({ success: false, "error-codes": ["timeout-or-duplicate"] });

    const response = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody());

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("RECAPTCHA_FAILED");
    expect(response.body.fields).toEqual({
      recaptchaToken:
        "The reCAPTCHA check didn't go through. Check the box again.",
    });
    expect(User.exists).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  it("fails instead of skipping the check when Google can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const response = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody());

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "RECAPTCHA_UNAVAILABLE",
      message:
        "We couldn't check the reCAPTCHA right now. Please try again in a moment.",
    });
    expect(User.create).not.toHaveBeenCalled();
  });

  it("fails when the secret key is wrong or missing", async () => {
    googleAnswers({ success: false, "error-codes": ["invalid-input-secret"] });
    const wrongKey = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody());

    const fetchMock = googleAnswers({ success: true });
    const missingKey = await request(makeApp({ recaptchaSecretKey: undefined }))
      .post(SIGNUP_PATH)
      .send(signupBody());

    expect(wrongKey.status).toBe(503);
    expect(missingKey.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  it("limits sign-up attempts from one IP address", async () => {
    const app = makeApp({ signupLimitPerHour: 2 });

    await request(app).post(SIGNUP_PATH).send({});
    await request(app).post(SIGNUP_PATH).send({});
    const response = await request(app).post(SIGNUP_PATH).send({});

    expect(response.status).toBe(429);
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    expect(response.body).toEqual({
      error: "TOO_MANY_REQUESTS",
      message: "Too many sign-up attempts. Please try again later.",
    });
  });
});

describe("sign-up field rules", () => {
  it("checks the email format", async () => {
    expect(await fieldErrorsFor({ email: "jordan@" })).toEqual({
      email: "Enter an email address like name@example.com.",
    });
  });

  it("needs 12 characters, both letter cases, and a number or symbol in the password", async () => {
    const cases = [
      ["Short & 1", "Use at least 12 characters."],
      ["CHALK UP & SEND IT", "Add a lowercase letter."],
      ["chalk up & send it", "Add an uppercase letter."],
      ["Chalk up and send it", "Add a number or a symbol."],
    ];
    for (const [password, message] of cases) {
      expect(await fieldErrorsFor({ password })).toEqual({ password: message });
    }
  });

  it("needs climbers to be at least 13, counting days in Toronto", async () => {
    todayInTorontoIs("2026-10-05T02:00:00Z");

    expect(await fieldErrorsFor({ dateOfBirth: "2013-10-05" })).toEqual({
      dateOfBirth: "You must be 13 or older.",
    });

    googleAnswers({ success: true });
    const thirteenToday = await request(makeApp())
      .post(SIGNUP_PATH)
      .send(signupBody({ dateOfBirth: "2013-10-04" }));
    expect(thirteenToday.status).toBe(201);
  });

  it("rejects birth dates that are in the future or don't exist", async () => {
    todayInTorontoIs("2026-10-04T16:00:00Z");

    expect(await fieldErrorsFor({ dateOfBirth: "2026-10-05" })).toEqual({
      dateOfBirth: "That date is in the future.",
    });
    for (const dateOfBirth of ["2001-02-29", "1899-12-31", "17/05/2000"]) {
      expect(await fieldErrorsFor({ dateOfBirth })).toEqual({
        dateOfBirth: "Enter a real date of birth.",
      });
    }
  });

  it("checks the postal code against the country", async () => {
    expect(await fieldErrorsFor({ postalCode: "12345" })).toEqual({
      postalCode: "Use the format A1A 1A1.",
    });
    expect(
      await fieldErrorsFor({ country: "US", postalCode: "M5H 2N2" }),
    ).toEqual({ postalCode: "Use the format 12345." });

    googleAnswers({ success: true });
    const app = makeApp();
    await request(app)
      .post(SIGNUP_PATH)
      .send(signupBody({ country: "us", postalCode: "10001-1234" }));
    await request(app)
      .post(SIGNUP_PATH)
      .send(
        signupBody({
          email: "sam@example.com",
          country: "GB",
          postalCode: "sw1a 1aa",
        }),
      );

    expect(savedUsers.map((user) => [user.country, user.postalCode])).toEqual([
      ["US", "10001-1234"],
      ["GB", "SW1A 1AA"],
    ]);
  });

  it("checks the phone number, gender, country and map pin", async () => {
    expect(
      await fieldErrorsFor({
        phone: "call me",
        gender: "OTHER",
        country: "XX",
        location: { lat: 120, lng: 0 },
      }),
    ).toEqual({
      phone: "Enter a valid phone number.",
      gender: "Choose an option.",
      country: "Choose your country.",
      location: "Choose your location again.",
    });
  });

  it("needs the Terms and Privacy Policy to be accepted", async () => {
    expect(await fieldErrorsFor({ acceptedTerms: false })).toEqual({
      acceptedTerms: "Agree to the Terms and Privacy Policy to continue.",
    });
  });
});

describe("User model", () => {
  const details = {
    firstName: "Jordan",
    lastName: "Sendwell",
    email: "  Jordan@Example.com ",
    passwordHash: "hash-that-must-stay-private",
    role: "CLIMBER",
  };

  it("stores the email trimmed and in lowercase", () => {
    expect(new User(details).email).toBe("jordan@example.com");
  });

  it("leaves the password hash out of JSON", () => {
    expect(JSON.stringify(new User(details))).not.toContain(
      "hash-that-must-stay-private",
    );
  });

  it("only accepts account roles", async () => {
    await expect(
      new User({ ...details, role: "VISITOR" }).validate(),
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it("needs the sign-up profile for climbers only", async () => {
    await expect(new User(details).validate()).rejects.toThrow(/dateOfBirth/);
    await expect(
      new User({ ...details, role: "GYM_ADMIN" }).validate(),
    ).resolves.toBeUndefined();
  });
});
