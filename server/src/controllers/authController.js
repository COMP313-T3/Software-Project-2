import { User } from "../models/User.js";
import {
  notLoggedIn,
  readSessionCookie,
  sessionExpired,
} from "../services/sessionService.js";
import { logger } from "../utils/logger.js";
import {
  clearSessionCookies,
  setRefreshCookie,
} from "../utils/sessionCookies.js";

/**
 * Builds the login, refresh, log out, and current user handlers.
 *
 * @param {ReturnType<typeof import("../config/auth.js").createAuthContext>} auth The login setup.
 * @returns {Record<"login" | "refresh" | "logout" | "me", import("express").RequestHandler>} The handlers.
 */
export function createAuthHandlers({ cookies, sessions, accessTokens, logIn }) {
  async function sendAccessToken(res, user, session) {
    setRefreshCookie(res, cookies, session);
    const { token, expiresAt } = await accessTokens.sign({
      userId: user.id,
      role: user.role,
      sessionId: session.sessionId,
    });
    res.json({
      userId: user.id,
      role: user.role,
      token,
      expiresAt: expiresAt.toISOString(),
    });
  }

  return {
    /**
     * Logs in with an email and password. Answers { userId, role, token, expiresAt }, with the
     * access token and when it stops working, and sets the refresh cookie.
     */
    async login(req, res) {
      const { user, session } = await logIn(req.body.email, req.body.password);
      await sendAccessToken(res, user, session);
    },

    /**
     * Swaps the refresh cookie for a new one and a new access token, in the same shape as login.
     * When the session ended, both login cookies are deleted.
     */
    async refresh(req, res) {
      const sent = req.cookies[cookies.refresh.name];
      const presented = readSessionCookie(sent);
      if (!presented) {
        if (sent !== undefined) clearSessionCookies(res, cookies);
        throw notLoggedIn();
      }

      let session;
      try {
        session = await sessions.rotate(presented);
      } catch (error) {
        clearSessionCookies(res, cookies);
        throw error;
      }

      const user = await User.findOne(
        { _id: session.userId, isActive: true },
        "role",
      );
      if (!user) {
        await sessions.end(session.sessionId);
        clearSessionCookies(res, cookies);
        throw sessionExpired();
      }
      await sendAccessToken(res, user, session);
    },

    /**
     * Ends the session in the refresh cookie and deletes both login cookies. Answers 204 even
     * when there was no session, so logging out twice is fine.
     */
    async logout(req, res) {
      const presented = readSessionCookie(req.cookies[cookies.refresh.name]);
      const userId = presented ? await sessions.logOut(presented) : null;
      if (userId) logger.info("Logged out", { userId });
      clearSessionCookies(res, cookies);
      res.status(204).end();
    },

    /**
     * Answers who is logged in, { userId, email, role, session }, where session is
     * { expiresIn, limitReached }: the seconds left, and whether activity can still extend it.
     */
    async me(req, res) {
      const user = await User.findOne(
        { _id: req.auth.userId, isActive: true },
        "email role",
      );
      if (!user) {
        await sessions.end(req.auth.sessionId);
        throw sessionExpired();
      }
      res.json({
        userId: user.id,
        email: user.email,
        role: user.role,
        session: req.auth.timing,
      });
    },
  };
}
