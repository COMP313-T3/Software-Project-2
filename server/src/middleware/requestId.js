import { randomUUID } from "node:crypto";

/**
 * Gives every request a random ID, available as req.id and sent back in the
 * X-Request-Id header, so an error a user sees can be matched to its log entry.
 * IDs sent by clients are ignored, so they can't be spoofed.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Next middleware.
 */
export function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
