import { HOUR, rateLimit } from "express-rate-limit";
import { AppError } from "../utils/AppError.js";

/**
 * Limits requests per hour, by IP address unless another key is given. Over the limit, the API
 * answers 429 with the usual error shape, plus a Retry-After header when it counts by IP address.
 *
 * @param {number} limitPerHour Requests allowed per key in an hour.
 * @param {string} message Message for the 429 answer.
 * @param {(req: import("express").Request) => string} [keyFor] What to count requests by,
 *   such as an email from the checked request body. Counts by IP address when left out. A limit
 *   counted this way sends no rate limit headers, since its count includes other people's
 *   requests and would show, for example, that someone asked for a reset link for an email.
 * @returns {import("express").RequestHandler} The middleware, with its own counters.
 */
export function hourlyRateLimit(limitPerHour, message, keyFor) {
  return rateLimit({
    windowMs: HOUR,
    limit: limitPerHour,
    standardHeaders: keyFor ? false : "draft-8",
    legacyHeaders: false,
    ...(keyFor ? { keyGenerator: keyFor } : {}),
    handler: (req, res, next) => {
      next(new AppError(429, "TOO_MANY_REQUESTS", message));
    },
  });
}
