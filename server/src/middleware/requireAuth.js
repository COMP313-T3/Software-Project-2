import { notLoggedIn } from "../services/sessionService.js";

const BEARER = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/;

/**
 * Lets a request through only with a valid access token in the Authorization header, from a
 * login session that's still going. Puts who made it in req.auth: userId, role, sessionId, the
 * session, and timing ({ expiresIn, limitReached }). The request counts as activity, which keeps
 * the session going, unless countsAsActivity is false.
 *
 * @param {ReturnType<typeof import("../config/auth.js").createAuthContext>} auth The login setup.
 * @param {{ countsAsActivity?: boolean }} [options] Whether the request keeps the session going.
 * @returns {import("express").RequestHandler} The middleware. It fails with 401 NOT_AUTHENTICATED
 *   without a valid token, 401 TOKEN_EXPIRED when the token ran out, or 401 SESSION_EXPIRED when
 *   the session ended.
 */
export function requireAuth({ accessTokens, sessions }, options = {}) {
  const countsAsActivity = options.countsAsActivity ?? true;

  return async (req, res, next) => {
    const token = BEARER.exec(req.get("authorization") ?? "")?.[1];
    if (!token) throw notLoggedIn();

    const claims = await accessTokens.verify(token);
    const session = await sessions.findActive(claims.sessionId, claims.userId);
    const timing = countsAsActivity
      ? await sessions.recordRequest(session)
      : sessions.timing(session);
    req.auth = { ...claims, session, timing };
    next();
  };
}
