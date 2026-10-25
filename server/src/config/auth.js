import { hkdfSync, randomBytes } from "node:crypto";
import { createCsrfProtection } from "../middleware/csrfProtection.js";
import { createAccessTokens } from "../services/accessTokenService.js";
import { createLoginService } from "../services/loginService.js";
import { createSessionService } from "../services/sessionService.js";
import { sessionCookieSettings } from "../utils/sessionCookies.js";

function deriveKey(secret, purpose) {
  return Buffer.from(hkdfSync("sha256", secret, "", `topsend ${purpose}`, 32));
}

/**
 * Builds everything login needs from the app's settings. Access tokens and CSRF tokens are
 * signed with separate keys derived from AUTH_SECRET. Without one, a random secret is made, so
 * tokens signed before a restart stop working; refresh cookies are stored in the database and
 * keep working.
 *
 * @param {{ authSecret?: string, session: { idleMinutes: number, absoluteHours: number }, loginLimits: typeof import("../config/env.js").DEFAULT_LOGIN_LIMITS, secureCookies: boolean }} settings
 *   AUTH_SECRET, how long a login lasts, the login limits, and whether cookies are HTTPS only.
 * @returns The cookie settings, access tokens, sessions, logIn, CSRF protection, and login limits.
 */
export function createAuthContext({
  authSecret,
  session,
  loginLimits,
  secureCookies,
}) {
  const secret = authSecret || randomBytes(32).toString("base64url");
  const cookies = sessionCookieSettings(secureCookies);
  const sessions = createSessionService(session);

  return {
    cookies,
    sessions,
    loginLimits,
    accessTokens: createAccessTokens(deriveKey(secret, "access tokens")),
    logIn: createLoginService({ sessions, limits: loginLimits }),
    csrf: createCsrfProtection({
      secret: deriveKey(secret, "csrf tokens").toString("hex"),
      cookies,
    }),
  };
}
