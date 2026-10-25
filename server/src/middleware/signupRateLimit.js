import { hourlyRateLimit } from "./hourlyRateLimit.js";

/**
 * Limits sign-up attempts per IP address per hour.
 *
 * @param {number} limitPerHour Attempts allowed from one IP address in an hour.
 * @returns {import("express").RequestHandler} The middleware, with its own counters.
 */
export function signupRateLimit(limitPerHour) {
  return hourlyRateLimit(
    limitPerHour,
    "Too many sign-up attempts. Please try again later.",
  );
}
