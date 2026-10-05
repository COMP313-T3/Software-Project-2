import { AppError } from "../utils/AppError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}

/**
 * Turns away requests that change something when they come from a page outside CLIENT_ORIGINS,
 * judged by the Origin header, or the Referer when there's no Origin. Browsers always send one
 * of them, so a request with neither comes from a script or a tool, not from another site, and
 * is let through.
 *
 * @param {string[]} clientOrigins The allowed origins.
 * @returns {import("express").RequestHandler} The middleware.
 */
export function requireAllowedOrigin(clientOrigins) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const referer = req.get("referer");
    const origin = req.get("origin") ?? (referer ? originOf(referer) : null);
    if (origin === null || clientOrigins.includes(origin)) {
      next();
      return;
    }
    next(
      new AppError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "Requests from this site aren't allowed.",
      ),
    );
  };
}
