/**
 * Tells browsers and proxies not to keep the response. A competition search from the Climber's
 * current location has the location in its address, which a browser's cache would otherwise
 * store with the answer (US-025 criterion 6).
 *
 * @param {import("express").Request} _req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Next middleware.
 */
export function noStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}
