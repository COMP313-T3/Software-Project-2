import { createHash, randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { LoginThrottle } from "../models/LoginThrottle.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { hashPassword, verifyPassword } from "./passwordService.js";

const MINUTE_MS = 60 * 1000;
const DUPLICATE_KEY = 11000;

let dummyHash;

function emailHash(email) {
  return createHash("sha256").update(email).digest("hex");
}

/**
 * A hash to check passwords against when the email has no account, so answering takes as long
 * as it does for a real account and the timing can't reveal which emails are registered.
 */
function hashForUnknownEmail() {
  dummyHash ??= hashPassword(randomBytes(16).toString("base64url"));
  return dummyHash;
}

function invalidCredentials() {
  return new AppError(
    401,
    "INVALID_CREDENTIALS",
    "Email or password is incorrect.",
  );
}

function loginLocked(lockedUntil, now) {
  const seconds = Math.ceil((lockedUntil.getTime() - now) / 1000);
  const minutes = Math.ceil(seconds / 60);
  const error = new AppError(
    429,
    "LOGIN_LOCKED",
    `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  );
  error.retryAfter = seconds;
  return error;
}

/**
 * Forgets an email's failed logins and lifts its lock, such as after its password was reset.
 *
 * @param {string} email The email, lowercased.
 * @returns {Promise<void>}
 */
export async function clearLoginFailures(email) {
  await LoginThrottle.deleteOne({ emailHash: emailHash(email) });
}

/**
 * Builds the login check. Every failed attempt answers "Email or password is incorrect.", whether
 * the email has no account, the account is turned off, or the password is wrong. Each attempt is
 * counted before the password is checked, so many at once can't get past the limit. Failed
 * answers wait longer as attempts add up, and too many lock the email for a while.
 *
 * @param {{ sessions: ReturnType<typeof import("./sessionService.js").createSessionService>, limits: typeof import("../config/env.js").DEFAULT_LOGIN_LIMITS }} options
 *   The session rules and the login limits.
 * @returns {(email: string, password: string) => Promise<{ user: import("mongoose").HydratedDocument<object>, session: { sessionId: string, cookie: string, absoluteExpiresAt: Date } }>}
 *   logIn, which checks the email (lowercased) and password and starts a session.
 */
export function createLoginService({ sessions, limits }) {
  const windowMs = limits.failureWindowMinutes * MINUTE_MS;
  const lockMs = limits.lockMinutes * MINUTE_MS;

  function delayAfter(attempts) {
    const delays = limits.failureDelaysMs;
    return delays[Math.min(attempts, delays.length) - 1] ?? 0;
  }

  async function clearIfOver(hash, now) {
    const throttle = await LoginThrottle.findOne({ emailHash: hash });
    if (!throttle) return;
    const locked = throttle.lockedUntil && throttle.lockedUntil.getTime() > now;
    const windowOver = throttle.windowStartedAt.getTime() + windowMs <= now;
    if (!locked && (throttle.lockedUntil || windowOver)) {
      await LoginThrottle.deleteOne({
        _id: throttle._id,
        windowStartedAt: throttle.windowStartedAt,
      });
    }
  }

  async function countAttempt(hash, now) {
    await clearIfOver(hash, now);
    const update = {
      $inc: { attempts: 1 },
      $setOnInsert: {
        windowStartedAt: new Date(now),
        expiresAt: new Date(now + windowMs),
      },
    };
    try {
      return await LoginThrottle.findOneAndUpdate({ emailHash: hash }, update, {
        upsert: true,
        returnDocument: "after",
      });
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
      return LoginThrottle.findOneAndUpdate({ emailHash: hash }, update, {
        returnDocument: "after",
      });
    }
  }

  async function lock(throttle, now) {
    const lockedUntil = new Date(now + lockMs);
    await LoginThrottle.updateOne(
      { _id: throttle._id },
      { $set: { lockedUntil, expiresAt: lockedUntil } },
    );
    return lockedUntil;
  }

  return async function logIn(email, password) {
    const now = Date.now();
    const hash = emailHash(email);
    const throttle = await countAttempt(hash, now);
    if (throttle.lockedUntil && throttle.lockedUntil.getTime() > now) {
      throw loginLocked(throttle.lockedUntil, now);
    }
    if (throttle.attempts > limits.failuresBeforeLock) {
      throw loginLocked(await lock(throttle, now), now);
    }

    const user = await User.findOne({ email }, "+passwordHash");
    const matches = await verifyPassword(
      user ? user.passwordHash : await hashForUnknownEmail(),
      password,
    );
    if (!user || !user.isActive || !matches) {
      const userId = user ? { userId: user.id } : {};
      logger.info("Login failed", userId);
      if (throttle.attempts >= limits.failuresBeforeLock) {
        await lock(throttle, now);
        logger.warn("Login locked after repeated failures", userId);
      }
      const delay = delayAfter(throttle.attempts);
      if (delay > 0) await sleep(delay);
      throw invalidCredentials();
    }

    await LoginThrottle.deleteOne({ emailHash: hash });
    const session = await sessions.start(user._id);
    logger.info("Logged in", { userId: user.id });
    return { user, session };
  };
}
