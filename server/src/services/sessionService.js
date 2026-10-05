import { createHash, randomBytes } from "node:crypto";
import { RefreshToken } from "../models/RefreshToken.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const SECRET_BYTES = 32;
const COOKIE_PATTERN = /^([a-f\d]{24})\.([\w-]{43})$/;
const PREVIOUS_SECRETS_KEPT = 5;

/**
 * How long the secret a refresh just replaced still gets a new one, for a refresh whose answer
 * never arrived, such as one cut off by a reload.
 */
const RETRY_GRACE_MS = 30 * 1000;

/**
 * Requests this close to the last recorded activity aren't written again, so a busy page doesn't
 * write to the database on every request. Keep-alives are always written.
 */
const REQUEST_WRITE_INTERVAL_MS = MINUTE_MS;

function hashSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

function newSecret() {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

function rotation(replacedHash, nextHash, now) {
  return {
    $set: { tokenHash: nextHash, rotatedAt: new Date(now) },
    $push: {
      previousTokenHashes: {
        $each: [replacedHash],
        $position: 0,
        $slice: PREVIOUS_SECRETS_KEPT,
      },
    },
  };
}

/**
 * Handles a refresh cookie whose secret isn't the current one. The secret replaced in the last
 * 30 seconds is a retry after an answer that never arrived, so it gets a new secret again. Any
 * other old secret means a copy of the cookie was used, so the session ends. A secret the session
 * never had changes nothing, so a made-up cookie can't end someone's session.
 *
 * @returns The session as it was before a retry's new secret, or null.
 */
async function retryOrRevoke(sessionId, presentedHash, nextHash, now) {
  const session = await RefreshToken.findOne(
    { _id: sessionId, previousTokenHashes: presentedHash },
    "+tokenHash +previousTokenHashes",
  );
  if (!session) return null;
  const justReplaced =
    session.previousTokenHashes[0] === presentedHash &&
    now - (session.rotatedAt?.getTime() ?? 0) <= RETRY_GRACE_MS;
  if (justReplaced) {
    return RefreshToken.findOneAndUpdate(
      { _id: sessionId, tokenHash: session.tokenHash },
      rotation(session.tokenHash, nextHash, now),
    );
  }
  await RefreshToken.deleteOne({ _id: sessionId });
  logger.warn("An old refresh cookie was used again, so its session ended", {
    userId: String(session.user),
  });
  return null;
}

/**
 * The error for a request with no login at all.
 *
 * @returns {AppError} 401 NOT_AUTHENTICATED.
 */
export function notLoggedIn() {
  return new AppError(401, "NOT_AUTHENTICATED", "Log in to continue.");
}

/**
 * The error for a login that ended: it timed out, was logged out, or its refresh cookie was
 * used twice.
 *
 * @returns {AppError} 401 SESSION_EXPIRED.
 */
export function sessionExpired() {
  return new AppError(
    401,
    "SESSION_EXPIRED",
    "Your session expired. Log in again to continue.",
  );
}

/**
 * Splits a refresh cookie into the session's ID and its secret.
 *
 * @param {unknown} value The cookie's value.
 * @returns {{ sessionId: string, secret: string } | null} The parts, or null when the value
 *   isn't a refresh cookie.
 */
export function readSessionCookie(value) {
  if (typeof value !== "string") return null;
  const match = COOKIE_PATTERN.exec(value);
  return match ? { sessionId: match[1], secret: match[2] } : null;
}

/**
 * Ends every login of a user, such as after their password was reset.
 *
 * @param {import("mongoose").Types.ObjectId | string} userId The user.
 * @returns {Promise<void>}
 */
export async function endAllSessions(userId) {
  await RefreshToken.deleteMany({ user: userId });
}

/**
 * Builds the login session rules. A session ends after idleMinutes without activity, or
 * absoluteHours after logging in, whichever comes first. Refreshing the access token doesn't
 * count as activity; requests the user makes and keep-alives do.
 *
 * @param {{ idleMinutes: number, absoluteHours: number }} settings How long a session lasts.
 * @returns The session functions: start, rotate, findActive, recordActivity, recordRequest,
 *   timing, end, and logOut.
 */
export function createSessionService({ idleMinutes, absoluteHours }) {
  const idleMs = idleMinutes * MINUTE_MS;
  const absoluteMs = absoluteHours * HOUR_MS;

  function endsAt(lastActiveAt, absoluteExpiresAt) {
    return new Date(
      Math.min(lastActiveAt.getTime() + idleMs, absoluteExpiresAt.getTime()),
    );
  }

  function isOver(session, now = Date.now()) {
    return (
      now >= endsAt(session.lastActiveAt, session.absoluteExpiresAt).getTime()
    );
  }

  /**
   * How long a session has left.
   *
   * @param {{ lastActiveAt: Date, absoluteExpiresAt: Date }} session The session.
   * @param {number} [now] The current time in milliseconds.
   * @returns {{ expiresIn: number, limitReached: boolean }} Whole seconds left, and whether it
   *   ends at its hard limit, so activity can't make it last longer.
   */
  function timing(session, now = Date.now()) {
    const end = endsAt(session.lastActiveAt, session.absoluteExpiresAt);
    return {
      expiresIn: Math.max(0, Math.floor((end.getTime() - now) / 1000)),
      limitReached: end.getTime() >= session.absoluteExpiresAt.getTime(),
    };
  }

  /**
   * Records that the user was active, which moves the idle limit forward. A time later than
   * now counts as now, and a time before the last recorded activity changes nothing.
   *
   * @param {{ _id: unknown, lastActiveAt: Date, absoluteExpiresAt: Date }} session The session,
   *   from findActive.
   * @param {Date} activeAt When the user was last active.
   * @returns {Promise<{ expiresIn: number, limitReached: boolean }>} How long the session has left.
   */
  async function recordActivity(session, activeAt) {
    const now = Date.now();
    const latest = Math.min(activeAt.getTime(), now);
    if (latest > session.lastActiveAt.getTime()) {
      const lastActiveAt = new Date(latest);
      await RefreshToken.updateOne(
        { _id: session._id },
        {
          $max: {
            lastActiveAt,
            expiresAt: endsAt(lastActiveAt, session.absoluteExpiresAt),
          },
        },
      );
      session.lastActiveAt = lastActiveAt;
    }
    return timing(session, now);
  }

  return {
    timing,
    recordActivity,

    /**
     * Records a request made with the access token as activity, unless the last recorded activity
     * is under a minute old.
     *
     * @param {{ _id: unknown, lastActiveAt: Date, absoluteExpiresAt: Date }} session The session,
     *   from findActive.
     * @returns {Promise<{ expiresIn: number, limitReached: boolean }>} How long the session has left.
     */
    async recordRequest(session) {
      const now = Date.now();
      if (now - session.lastActiveAt.getTime() < REQUEST_WRITE_INTERVAL_MS) {
        return timing(session, now);
      }
      return recordActivity(session, new Date(now));
    },

    /**
     * Starts a session for a user who just logged in.
     *
     * @param {import("mongoose").Types.ObjectId} userId The user.
     * @returns {Promise<{ sessionId: string, cookie: string, absoluteExpiresAt: Date }>} The
     *   session's ID, the refresh cookie's value, and when the session ends at the latest.
     */
    async start(userId) {
      const now = new Date();
      const secret = newSecret();
      const absoluteExpiresAt = new Date(now.getTime() + absoluteMs);
      const session = await RefreshToken.create({
        user: userId,
        tokenHash: hashSecret(secret),
        lastActiveAt: now,
        absoluteExpiresAt,
        expiresAt: endsAt(now, absoluteExpiresAt),
      });
      return {
        sessionId: session.id,
        cookie: `${session.id}.${secret}`,
        absoluteExpiresAt,
      };
    },

    /**
     * Swaps a refresh cookie for a new one. An older cookie of the session ends it, since someone
     * else may have a copy, except the one replaced in the last 30 seconds (see retryOrRevoke).
     *
     * @param {{ sessionId: string, secret: string }} presented The parts of the cookie sent.
     * @returns {Promise<{ userId: string, sessionId: string, cookie: string, absoluteExpiresAt: Date }>}
     *   The session's user, its ID, the new cookie's value, and when the session ends at the latest.
     * @throws {AppError} 401 SESSION_EXPIRED when the session is over or the cookie isn't its current one.
     */
    async rotate({ sessionId, secret }) {
      const now = Date.now();
      const presentedHash = hashSecret(secret);
      const next = newSecret();
      const nextHash = hashSecret(next);
      const session =
        (await RefreshToken.findOneAndUpdate(
          { _id: sessionId, tokenHash: presentedHash },
          rotation(presentedHash, nextHash, now),
        )) ?? (await retryOrRevoke(sessionId, presentedHash, nextHash, now));
      if (!session) throw sessionExpired();
      if (isOver(session, now)) {
        await RefreshToken.deleteOne({ _id: sessionId });
        throw sessionExpired();
      }
      return {
        userId: String(session.user),
        sessionId,
        cookie: `${sessionId}.${next}`,
        absoluteExpiresAt: session.absoluteExpiresAt,
      };
    },

    /**
     * Loads a session that's still going, for a request made with an access token.
     *
     * @param {string} sessionId The session named in the access token.
     * @param {string} userId The user named in the access token.
     * @returns {Promise<import("mongoose").HydratedDocument<{ lastActiveAt: Date, absoluteExpiresAt: Date }>>}
     *   The session.
     * @throws {AppError} 401 SESSION_EXPIRED when it ended.
     */
    async findActive(sessionId, userId) {
      const session = await RefreshToken.findOne({
        _id: sessionId,
        user: userId,
      });
      if (!session) throw sessionExpired();
      if (isOver(session)) {
        await RefreshToken.deleteOne({ _id: sessionId });
        throw sessionExpired();
      }
      return session;
    },

    /**
     * Ends one session the server already trusts, such as the one in a valid access token.
     *
     * @param {string} sessionId The session.
     * @returns {Promise<void>}
     */
    async end(sessionId) {
      await RefreshToken.deleteOne({ _id: sessionId });
    },

    /**
     * Ends the session in a refresh cookie, when the cookie holds its current secret or one it
     * replaced. A made-up cookie ends nothing.
     *
     * @param {{ sessionId: string, secret: string }} presented The parts of the cookie sent.
     * @returns {Promise<string | null>} The session's user ID, or null when nothing ended.
     */
    async logOut({ sessionId, secret }) {
      const presentedHash = hashSecret(secret);
      const session =
        (await RefreshToken.findOneAndDelete({
          _id: sessionId,
          tokenHash: presentedHash,
        })) ??
        (await RefreshToken.findOneAndDelete({
          _id: sessionId,
          previousTokenHashes: presentedHash,
        }));
      return session ? String(session.user) : null;
    },
  };
}
