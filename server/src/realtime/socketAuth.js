import { notLoggedIn } from "../services/sessionService.js";
import { AppError } from "../utils/AppError.js";

/**
 * Login checks shared by the live leaderboards (US-020) and live scorecards (US-031).
 *
 * The access token is checked once, when the connection opens, exactly as requireAuth checks the
 * Authorization header. It runs out after 15 minutes, but a connection stays open much longer, so
 * later checks don't verify the token again (that would close every connection after 15 minutes).
 * They check the login session the token named instead: it ends when the Climber logs out, goes
 * idle too long, resets their password, or is deactivated, and then the connection loses access.
 */

/**
 * Who opened a connection, from the token in io(url, { auth: { token } }).
 *
 * @param {unknown} token The token the client sent, if any.
 * @param {{ accessTokens: object, sessions: object }} auth The login setup.
 * @returns {Promise<{ userId: string, role: string, sessionId: string } | null>} The viewer, or
 *   null when no token was sent (a Visitor).
 * @throws {AppError} 401 NOT_AUTHENTICATED, TOKEN_EXPIRED or SESSION_EXPIRED.
 */
export async function viewerFromToken(token, { accessTokens, sessions }) {
  if (token === undefined || token === null || token === "") return null;
  if (typeof token !== "string") throw notLoggedIn();
  const claims = await accessTokens.verify(token);
  await sessions.findActive(claims.sessionId, claims.userId);
  return { userId: claims.userId, role: claims.role, sessionId: claims.sessionId };
}

/**
 * Checks that a connection's login session is still going, without the token, which may have run
 * out since the connection opened. A Visitor (null) has nothing to check.
 *
 * @param {{ userId: string, sessionId: string } | null} viewer From viewerFromToken.
 * @param {{ sessions: object }} auth The login setup.
 * @returns {Promise<void>}
 * @throws {AppError} 401 SESSION_EXPIRED when the session ended.
 */
export async function assertStillLoggedIn(viewer, { sessions }) {
  if (!viewer) return;
  await sessions.findActive(viewer.sessionId, viewer.userId);
}

/**
 * The API's error shape, { error, message }, for an acknowledgement, a closed event, or a refused
 * connection. Anything that isn't an AppError gets a general message, so nothing internal leaks.
 *
 * @param {unknown} error The error.
 * @returns {{ error: string, message: string }}
 */
export function errorBody(error) {
  if (error instanceof AppError) return { error: error.code, message: error.message };
  return { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
}

/**
 * The error a refused connection hands the client in err.data, as Socket.IO middleware expects.
 *
 * @param {unknown} error Why it was refused.
 * @returns {Error & { data: { error: string, message: string } }}
 */
export function refusedConnection(error) {
  const refused = new Error(error instanceof AppError ? error.message : "Log in to continue.");
  refused.data = errorBody(error);
  return refused;
}
