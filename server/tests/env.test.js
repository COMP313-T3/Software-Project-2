import { describe, expect, it } from "vitest";
import { loadConfig, RECAPTCHA_TEST_SECRET_KEY } from "../src/config/env.js";

const VALID_URI = "mongodb://localhost:27017/topsend_marker42";
const REAL_SECRET = "real-secret-marker42";
const AUTH_SECRET = "auth-secret-marker42-0123456789abcdef";

describe("loadConfig", () => {
  it("applies defaults for the optional settings", () => {
    expect(loadConfig({ MONGODB_URI: VALID_URI })).toEqual({
      nodeEnv: "development",
      port: 4000,
      mongodbUri: VALID_URI,
      clientOrigins: ["http://localhost:5173"],
      recaptchaSecretKey: RECAPTCHA_TEST_SECRET_KEY,
      signupLimitPerHour: 50,
      googleMapsServerKey: "",
      appUrl: "http://localhost:5173",
      smtp: null,
      mailFrom: "",
      authSecret: "",
      session: { idleMinutes: 60, absoluteHours: 12 },
    });
  });

  it("reads the Google Maps server key without spaces around it", () => {
    expect(
      loadConfig({
        MONGODB_URI: VALID_URI,
        GOOGLE_MAPS_SERVER_KEY: " maps-key ",
      }).googleMapsServerKey,
    ).toBe("maps-key");
  });

  it("uses the reCAPTCHA secret key when it is set", () => {
    const config = loadConfig({
      MONGODB_URI: VALID_URI,
      RECAPTCHA_SECRET_KEY: ` ${REAL_SECRET} `,
    });

    expect(config.recaptchaSecretKey).toBe(REAL_SECRET);
  });

  it("requires the real reCAPTCHA secret key in production", () => {
    const production = {
      MONGODB_URI: VALID_URI,
      NODE_ENV: "production",
      APP_URL: "https://topsend.example",
      AUTH_SECRET,
    };

    expect(() => loadConfig(production)).toThrow(
      "RECAPTCHA_SECRET_KEY must be set to the real secret key in production.",
    );
    expect(() =>
      loadConfig({
        ...production,
        RECAPTCHA_SECRET_KEY: RECAPTCHA_TEST_SECRET_KEY,
      }),
    ).toThrow("RECAPTCHA_SECRET_KEY must be set");
    expect(
      loadConfig({ ...production, RECAPTCHA_SECRET_KEY: REAL_SECRET })
        .recaptchaSecretKey,
    ).toBe(REAL_SECRET);
  });

  it("reads the sign-up limit and rejects one that isn't a positive whole number", () => {
    expect(
      loadConfig({ MONGODB_URI: VALID_URI, SIGNUP_LIMIT_PER_HOUR: "5" })
        .signupLimitPerHour,
    ).toBe(5);

    for (const value of ["0", "-3", "2.5", "lots"]) {
      expect(() =>
        loadConfig({ MONGODB_URI: VALID_URI, SIGNUP_LIMIT_PER_HOUR: value }),
      ).toThrow("SIGNUP_LIMIT_PER_HOUR must be a whole number of 1 or more.");
    }
  });

  it("requires MONGODB_URI", () => {
    expect(() => loadConfig({})).toThrow("MONGODB_URI is not set");
    expect(() => loadConfig({ MONGODB_URI: "   " })).toThrow(
      "MONGODB_URI is not set",
    );
  });

  it("rejects a connection string with the wrong scheme", () => {
    expect(() => loadConfig({ MONGODB_URI: "https://example.com" })).toThrow(
      "must start with mongodb:// or mongodb+srv://",
    );
  });

  it("rejects an invalid port without echoing any value", () => {
    let message = "";
    try {
      loadConfig({ MONGODB_URI: VALID_URI, PORT: "eighty" });
    } catch (error) {
      message = error.message;
    }

    expect(message).toBe("PORT must be a whole number between 1 and 65535.");
    expect(message).not.toContain("marker42");
  });

  it("reads a list of client origins", () => {
    const config = loadConfig({
      MONGODB_URI: VALID_URI,
      PORT: "5050",
      CLIENT_ORIGINS: "http://localhost:5173, https://topsend.example",
    });

    expect(config.port).toBe(5050);
    expect(config.clientOrigins).toEqual([
      "http://localhost:5173",
      "https://topsend.example",
    ]);
  });

  it("reads the web app's address for links in emails", () => {
    expect(
      loadConfig({
        MONGODB_URI: VALID_URI,
        APP_URL: " https://topsend.example/ ",
      }).appUrl,
    ).toBe("https://topsend.example");

    for (const value of [
      "topsend.example",
      "ftp://topsend.example",
      "https://topsend.example/?a=1",
    ]) {
      expect(() =>
        loadConfig({ MONGODB_URI: VALID_URI, APP_URL: value }),
      ).toThrow(
        "APP_URL must be the web app's address, like http://localhost:5173.",
      );
    }
  });

  it("requires the web app's address in production", () => {
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        NODE_ENV: "production",
        RECAPTCHA_SECRET_KEY: REAL_SECRET,
      }),
    ).toThrow("APP_URL must be set in production to the web app's address.");
  });

  it("requires AUTH_SECRET in production, and at least 32 characters whenever it's set", () => {
    const production = {
      MONGODB_URI: VALID_URI,
      NODE_ENV: "production",
      APP_URL: "https://topsend.example",
      RECAPTCHA_SECRET_KEY: REAL_SECRET,
    };
    const shortSecret = "short-secret-marker42";

    expect(() => loadConfig(production)).toThrow(
      "AUTH_SECRET must be set in production.",
    );
    expect(loadConfig({ ...production, AUTH_SECRET }).authSecret).toBe(
      AUTH_SECRET,
    );
    for (const env of [
      { ...production, AUTH_SECRET: shortSecret },
      { MONGODB_URI: VALID_URI, AUTH_SECRET: shortSecret },
    ]) {
      expect(() => loadConfig(env)).toThrow(
        "AUTH_SECRET must be at least 32 characters.",
      );
      expect(() => loadConfig(env)).not.toThrow(shortSecret);
    }
  });

  it("reads how long a login lasts", () => {
    expect(
      loadConfig({
        MONGODB_URI: VALID_URI,
        SESSION_IDLE_MINUTES: "3",
        SESSION_ABSOLUTE_HOURS: "1",
      }).session,
    ).toEqual({ idleMinutes: 3, absoluteHours: 1 });
  });

  it("rejects login timing that is out of range or ends idle logins after the hard limit", () => {
    for (const value of ["2", "721", "2.5", "an hour"]) {
      expect(() =>
        loadConfig({ MONGODB_URI: VALID_URI, SESSION_IDLE_MINUTES: value }),
      ).toThrow("SESSION_IDLE_MINUTES must be a whole number from 3 to 720.");
    }
    for (const value of ["0", "169", "1.5"]) {
      expect(() =>
        loadConfig({ MONGODB_URI: VALID_URI, SESSION_ABSOLUTE_HOURS: value }),
      ).toThrow("SESSION_ABSOLUTE_HOURS must be a whole number from 1 to 168.");
    }
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        SESSION_IDLE_MINUTES: "120",
        SESSION_ABSOLUTE_HOURS: "1",
      }),
    ).toThrow(
      "SESSION_ABSOLUTE_HOURS must be at least as long as SESSION_IDLE_MINUTES.",
    );
  });

  it("rejects an unknown NODE_ENV, so a typo can't turn off production's checks", () => {
    for (const value of ["Production", "staging", "prod"]) {
      expect(() =>
        loadConfig({ MONGODB_URI: VALID_URI, NODE_ENV: value }),
      ).toThrow("NODE_ENV must be development, production, or test.");
    }
  });

  it("rejects an APP_URL with a query, a fragment, or a user name", () => {
    for (const value of [
      "http://localhost:5173/?",
      "http://localhost:5173/#",
      "https://user:secret@topsend.example",
    ]) {
      expect(() =>
        loadConfig({ MONGODB_URI: VALID_URI, APP_URL: value }),
      ).toThrow("APP_URL must be the web app's address");
    }
  });

  it("needs MAIL_FROM when SMTP_USER isn't an email address", () => {
    const smtp = {
      MONGODB_URI: VALID_URI,
      SMTP_HOST: "smtp.sendgrid.net",
      SMTP_USER: "apikey",
      SMTP_PASS: "key",
    };

    expect(() => loadConfig(smtp)).toThrow(
      "Set MAIL_FROM to the address emails come from, since SMTP_USER isn't an email address.",
    );
    expect(
      loadConfig({ ...smtp, MAIL_FROM: "TopSend <hello@topsend.example>" })
        .mailFrom,
    ).toBe("TopSend <hello@topsend.example>");
  });

  it("reads the SMTP settings and sends from TopSend at that address", () => {
    const config = loadConfig({
      MONGODB_URI: VALID_URI,
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: " topsend@example.com ",
      SMTP_PASS: " app-password ",
    });

    expect(config.smtp).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      user: "topsend@example.com",
      pass: "app-password",
    });
    expect(config.mailFrom).toBe("TopSend <topsend@example.com>");
  });

  it("uses MAIL_FROM and SMTP_PORT when they're set", () => {
    const config = loadConfig({
      MONGODB_URI: VALID_URI,
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      MAIL_FROM: "TopSend <hello@topsend.example>",
    });

    expect(config.smtp.port).toBe(587);
    expect(config.mailFrom).toBe("TopSend <hello@topsend.example>");
  });

  it("rejects SMTP settings that are only half filled in", () => {
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "user",
      }),
    ).toThrow("Set both SMTP_USER and SMTP_PASS, or leave both empty.");
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        SMTP_USER: "user",
        SMTP_PASS: "pass",
      }),
    ).toThrow("SMTP_HOST must be set when SMTP_USER and SMTP_PASS are.");
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        SMTP_HOST: "smtp.gmail.com",
        SMTP_PORT: "mail",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
      }),
    ).toThrow("SMTP_PORT must be a whole number between 1 and 65535.");
  });

  it("rejects an origin with a trailing slash", () => {
    expect(() =>
      loadConfig({
        MONGODB_URI: VALID_URI,
        CLIENT_ORIGINS: "http://localhost:5173/",
      }),
    ).toThrow("no trailing slash");
  });
});
