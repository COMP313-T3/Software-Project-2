import { doubleCsrf } from "csrf-csrf";
import { readSessionCookie } from "../services/sessionService.js";
import { AppError } from "../utils/AppError.js";

/**
 * CSRF protection for the requests that rely on the refresh cookie, using csrf-csrf's double
 * submit cookie pattern. GET /api/auth/csrf hands out a token and sets the CSRF cookie, and each
 * protected request sends the token back in the X-CSRF-Token header. Tokens are signed and tied
 * to the login session in the refresh cookie, so logging in or out makes the old token stop
 * working, and the client asks for a new one.
 *
 * @param {{ secret: string, cookies: import("../utils/sessionCookies.js").SessionCookies }} options
 *   The key tokens are signed with, and the cookie settings.
 * @returns {{ sendToken: import("express").RequestHandler, requireToken: import("express").RequestHandler }}
 *   sendToken answers { csrfToken, sessionCookie }, reusing the current token while it's still
 *   valid. sessionCookie says whether the browser sent a refresh cookie, which the page can't
 *   see for itself, so it only tries to pick up a login when there may be one.
 *   requireToken lets a request through only with a valid token, and answers 403 CSRF_INVALID otherwise.
 */
export function createCsrfProtection({ secret, cookies }) {
  const sessionIn = (req) =>
    readSessionCookie(req.cookies[cookies.refresh.name]);
  const { generateCsrfToken, validateRequest } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (req) => sessionIn(req)?.sessionId ?? "",
    cookieName: cookies.csrf.name,
    cookieOptions: cookies.csrf.options,
  });

  return {
    sendToken(req, res) {
      res.json({
        csrfToken: generateCsrfToken(req, res),
        sessionCookie: sessionIn(req) !== null,
      });
    },

    requireToken(req, res, next) {
      if (validateRequest(req)) {
        next();
        return;
      }
      next(
        new AppError(
          403,
          "CSRF_INVALID",
          "This page's security check expired. Refresh the page and try again.",
        ),
      );
    },
  };
}
