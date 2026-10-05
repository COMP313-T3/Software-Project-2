/**
 * @typedef {{ name: string, options: import("express").CookieOptions }} CookieSettings
 * @typedef {{ refresh: CookieSettings, csrf: CookieSettings }} SessionCookies
 */

/**
 * Names and settings of the login cookies. Both are HttpOnly and SameSite=Strict. The refresh
 * cookie is only sent to /api/auth. In production both are Secure and use the name prefixes that
 * browsers enforce: __Secure- (HTTPS only) and __Host- (this host only, for the whole site).
 *
 * @param {boolean} secure Whether the site runs on HTTPS, as it does in production.
 * @returns {SessionCookies} The refresh cookie and the CSRF cookie.
 */
export function sessionCookieSettings(secure) {
  return {
    refresh: {
      name: secure ? "__Secure-topsend.refresh" : "topsend.refresh",
      options: {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/api/auth",
      },
    },
    csrf: {
      name: secure ? "__Host-topsend.csrf" : "topsend.csrf",
      options: { httpOnly: true, secure, sameSite: "strict", path: "/" },
    },
  };
}

/**
 * Sets the refresh cookie. It lasts until the session's hard limit; the server ends idle
 * sessions on its own.
 *
 * @param {import("express").Response} res The response.
 * @param {SessionCookies} cookies The cookie settings.
 * @param {{ cookie: string, absoluteExpiresAt: Date }} session The cookie's value and when the
 *   session ends at the latest.
 */
export function setRefreshCookie(res, cookies, { cookie, absoluteExpiresAt }) {
  res.cookie(cookies.refresh.name, cookie, {
    ...cookies.refresh.options,
    maxAge: Math.max(0, absoluteExpiresAt.getTime() - Date.now()),
  });
}

/**
 * Deletes both login cookies from the browser.
 *
 * @param {import("express").Response} res The response.
 * @param {SessionCookies} cookies The cookie settings.
 */
export function clearSessionCookies(res, cookies) {
  res.clearCookie(cookies.refresh.name, cookies.refresh.options);
  res.clearCookie(cookies.csrf.name, cookies.csrf.options);
}
