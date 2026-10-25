import { MINUTE, rateLimit } from "express-rate-limit";
import { AppError } from "../utils/AppError.js";

/**
 * Limits failed logins per IP address over 15 minutes. Successful logins aren't counted, since
 * everyone on a gym's Wi-Fi shares one address and many climbers log in at the start of a
 * competition.
 *
 * @param {number} failuresPer15Minutes Failed logins allowed from one IP address in 15 minutes.
 * @returns {import("express").RequestHandler} The middleware, with its own counters.
 */
export function loginRateLimit(failuresPer15Minutes) {
  return rateLimit({
    windowMs: 15 * MINUTE,
    limit: failuresPer15Minutes,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) => {
      next(
        new AppError(
          429,
          "TOO_MANY_REQUESTS",
          "Too many failed logins from this network. Please try again later.",
        ),
      );
    },
  });
}
