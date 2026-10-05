const DEFAULT_PORT = 4000;
const NODE_ENVS = ["development", "production", "test"];
const DEFAULT_CLIENT_ORIGINS = "http://localhost:5173";
const DEFAULT_SMTP_PORT = 465;
export const DEFAULT_APP_URL = "http://localhost:5173";
export const DEFAULT_SIGNUP_LIMIT_PER_HOUR = 50;
export const DEFAULT_GEOCODE_LIMIT_PER_HOUR = 200;
const AUTH_SECRET_MIN_LENGTH = 32;
const AUTH_SECRET_COMMAND =
  "node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"";

/**
 * How long a login lasts: it ends after this many minutes without activity, and this many hours
 * after logging in no matter what.
 */
export const DEFAULT_SESSION = Object.freeze({
  idleMinutes: 60,
  absoluteHours: 12,
});

/**
 * Login limits. An email is locked for lockMinutes after failuresBeforeLock failed attempts
 * within failureWindowMinutes. An IP address gets failuresPerIpPer15Minutes failed attempts.
 * Each failed answer waits the next delay in failureDelaysMs first, and the last one repeats.
 */
export const DEFAULT_LOGIN_LIMITS = Object.freeze({
  failuresBeforeLock: 10,
  failureWindowMinutes: 15,
  lockMinutes: 15,
  failuresPerIpPer15Minutes: 100,
  failureDelaysMs: Object.freeze([0, 0, 500, 1000, 2000, 4000]),
});

/**
 * Password reset limits: link requests per email and per IP address, and tries per IP address at
 * opening a link or saving the new password.
 */
export const DEFAULT_PASSWORD_RESET_LIMITS = Object.freeze({
  requestsPerEmailPerHour: 3,
  requestsPerIpPerHour: 30,
  linkTriesPerIpPerHour: 30,
});

/**
 * Google's published test secret for reCAPTCHA v2, paired with its public test site key.
 * Every check made with it passes, so it is only used outside production, when
 * RECAPTCHA_SECRET_KEY is empty.
 */
export const RECAPTCHA_TEST_SECRET_KEY =
  "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

/**
 * Splits CLIENT_ORIGINS and checks that each entry is a bare origin. CORS compares
 * origins exactly, so a trailing slash or a path would silently block the browser.
 *
 * @param {string} value Comma-separated origins.
 * @returns {string[]} The origins.
 * @throws {Error} When an entry is not a bare origin.
 */
function parseOrigins(value) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.origin !== origin) {
      throw new Error(
        "CLIENT_ORIGINS must list origins like http://localhost:5173, separated by commas, with no trailing slash.",
      );
    }
  }

  return origins;
}

/**
 * Checks APP_URL, the address of the web app that links in emails point to.
 *
 * @param {string} value The address, such as http://localhost:5173.
 * @returns {string} The address without a trailing slash.
 * @throws {Error} When it isn't a plain http or https address, such as one with a query string.
 */
function parseAppUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    parsed = null;
  }
  if (
    !parsed ||
    !["http:", "https:"].includes(parsed.protocol) ||
    /[?#]/.test(value) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "APP_URL must be the web app's address, like http://localhost:5173.",
    );
  }
  return parsed.href.replace(/\/+$/, "");
}

/**
 * Reads the SMTP settings used to send emails. Both SMTP_USER and SMTP_PASS must be set for
 * email to be sent; while both are empty, there is no SMTP connection.
 *
 * @param {Record<string, string | undefined>} env Environment variables.
 * @returns {{ host: string, port: number, user: string, pass: string } | null} The settings, or null.
 * @throws {Error} When only one of the two is set, or the host or port is missing or invalid.
 */
function parseSmtp(env) {
  const user = env.SMTP_USER?.trim() ?? "";
  const pass = env.SMTP_PASS?.trim() ?? "";
  if (!user && !pass) return null;
  if (!user || !pass) {
    throw new Error("Set both SMTP_USER and SMTP_PASS, or leave both empty.");
  }

  const host = env.SMTP_HOST?.trim();
  if (!host) {
    throw new Error("SMTP_HOST must be set when SMTP_USER and SMTP_PASS are.");
  }

  const port = env.SMTP_PORT?.trim()
    ? Number(env.SMTP_PORT)
    : DEFAULT_SMTP_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a whole number between 1 and 65535.");
  }

  return { host, port, user, pass };
}

/**
 * Reads an optional whole number setting.
 *
 * @param {string | undefined} value The variable's value.
 * @param {number} fallback Used when the variable is empty.
 * @param {number} min Smallest value allowed.
 * @param {number} max Largest value allowed.
 * @param {string} message Error message for a value that isn't allowed.
 * @returns {number} The number.
 * @throws {Error} When the value isn't a whole number from min to max.
 */
function wholeNumber(value, fallback, min, max, message) {
  if (!value?.trim()) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(message);
  }
  return number;
}

/**
 * Reads AUTH_SECRET, the key that login tokens and CSRF tokens are signed with. Outside
 * production it can be empty, and the API then makes a random one each time it starts.
 *
 * @param {string | undefined} value The variable's value.
 * @param {boolean} isProduction Whether NODE_ENV is production.
 * @returns {string} The secret, or an empty string.
 * @throws {Error} When it's missing in production or too short.
 */
function parseAuthSecret(value, isProduction) {
  const secret = value?.trim() ?? "";
  if (!secret && isProduction) {
    throw new Error(
      `AUTH_SECRET must be set in production. Make one with: ${AUTH_SECRET_COMMAND}`,
    );
  }
  if (secret && secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters. Make one with: ${AUTH_SECRET_COMMAND}`,
    );
  }
  return secret;
}

/**
 * Reads how long a login lasts.
 *
 * @param {Record<string, string | undefined>} env Environment variables.
 * @returns {{ idleMinutes: number, absoluteHours: number }} The session timing.
 * @throws {Error} When a value is out of range, or the hard limit is shorter than the idle limit.
 */
function parseSession(env) {
  const idleMinutes = wholeNumber(
    env.SESSION_IDLE_MINUTES,
    DEFAULT_SESSION.idleMinutes,
    3,
    720,
    "SESSION_IDLE_MINUTES must be a whole number from 3 to 720.",
  );
  const absoluteHours = wholeNumber(
    env.SESSION_ABSOLUTE_HOURS,
    DEFAULT_SESSION.absoluteHours,
    1,
    168,
    "SESSION_ABSOLUTE_HOURS must be a whole number from 1 to 168.",
  );
  if (absoluteHours * 60 < idleMinutes) {
    throw new Error(
      "SESSION_ABSOLUTE_HOURS must be at least as long as SESSION_IDLE_MINUTES.",
    );
  }
  return { idleMinutes, absoluteHours };
}

/**
 * Reads and validates the server settings from environment variables.
 * Error messages name the variable but never include its value.
 *
 * @param {Record<string, string | undefined>} env Environment variables, usually process.env.
 * @returns {{ nodeEnv: string, port: number, mongodbUri: string, clientOrigins: string[], recaptchaSecretKey: string, signupLimitPerHour: number, googleMapsServerKey: string, appUrl: string, smtp: { host: string, port: number, user: string, pass: string } | null, mailFrom: string, authSecret: string, session: { idleMinutes: number, absoluteHours: number } }} Validated settings.
 * @throws {Error} When a required variable is missing or a value is invalid.
 */
export function loadConfig(env) {
  const nodeEnv = env.NODE_ENV?.trim() || "development";
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  const mongodbUri = env.MONGODB_URI?.trim();
  if (!mongodbUri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and fill it in.",
    );
  }
  if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    throw new Error(
      "MONGODB_URI must start with mongodb:// or mongodb+srv://.",
    );
  }

  const port = env.PORT?.trim() ? Number(env.PORT) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a whole number between 1 and 65535.");
  }

  const isProduction = nodeEnv === "production";
  const recaptchaSecretKey =
    env.RECAPTCHA_SECRET_KEY?.trim() ||
    (isProduction ? "" : RECAPTCHA_TEST_SECRET_KEY);
  if (
    isProduction &&
    (!recaptchaSecretKey || recaptchaSecretKey === RECAPTCHA_TEST_SECRET_KEY)
  ) {
    throw new Error(
      "RECAPTCHA_SECRET_KEY must be set to the real secret key in production.",
    );
  }

  const signupLimitPerHour = env.SIGNUP_LIMIT_PER_HOUR?.trim()
    ? Number(env.SIGNUP_LIMIT_PER_HOUR)
    : DEFAULT_SIGNUP_LIMIT_PER_HOUR;
  if (!Number.isInteger(signupLimitPerHour) || signupLimitPerHour < 1) {
    throw new Error(
      "SIGNUP_LIMIT_PER_HOUR must be a whole number of 1 or more.",
    );
  }

  const appUrl = env.APP_URL?.trim() || (isProduction ? "" : DEFAULT_APP_URL);
  if (!appUrl) {
    throw new Error(
      "APP_URL must be set in production to the web app's address.",
    );
  }

  const smtp = parseSmtp(env);
  const mailFrom = env.MAIL_FROM?.trim() ?? "";
  if (smtp && !mailFrom && !smtp.user.includes("@")) {
    throw new Error(
      "Set MAIL_FROM to the address emails come from, since SMTP_USER isn't an email address.",
    );
  }

  return {
    nodeEnv,
    port,
    mongodbUri,
    clientOrigins: parseOrigins(env.CLIENT_ORIGINS ?? DEFAULT_CLIENT_ORIGINS),
    recaptchaSecretKey,
    signupLimitPerHour,
    googleMapsServerKey: env.GOOGLE_MAPS_SERVER_KEY?.trim() ?? "",
    appUrl: parseAppUrl(appUrl),
    smtp,
    mailFrom: mailFrom || (smtp ? `TopSend <${smtp.user}>` : ""),
    authSecret: parseAuthSecret(env.AUTH_SECRET, isProduction),
    session: parseSession(env),
  };
}
