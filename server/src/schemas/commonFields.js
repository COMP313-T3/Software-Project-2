import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants/pagination.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;
const PAGE_MESSAGE = "Page must be a whole number from 1.";
const LIMIT_MESSAGE = `Limit must be from 1 to ${MAX_PAGE_SIZE}.`;

/**
 * A MongoDB ID, such as a gym's or a competition's, from a route, a query string, or a body. Its
 * hex letters may be in either case, and it comes back lowercase, as IDs read from the database
 * do, so services can compare the two as text.
 *
 * @param {string} label What the ID is for, used in the message: "Invalid <label> id."
 */
export function objectId(label) {
  const message = `Invalid ${label} id.`;
  return z.string({ error: message }).regex(OBJECT_ID, { error: message }).toLowerCase();
}

/** The page of a list to return, from 1. Query strings are text, so it's coerced. */
export const page = z.coerce
  .number({ error: PAGE_MESSAGE })
  .int({ error: PAGE_MESSAGE })
  .min(1, { error: PAGE_MESSAGE })
  .default(1);

/** How many items a page of a list holds. */
export const limit = z.coerce
  .number({ error: LIMIT_MESSAGE })
  .int({ error: LIMIT_MESSAGE })
  .min(1, { error: LIMIT_MESSAGE })
  .max(MAX_PAGE_SIZE, { error: LIMIT_MESSAGE })
  .default(DEFAULT_PAGE_SIZE);

/**
 * Required text, trimmed, for forms that aren't about the user's own account: "Enter the <label>."
 * (accountFields.text says "Enter your <label>.", which suits sign-up but not a competition.)
 *
 * @param {string} label The field's name in the message, such as "competition name".
 * @param {number} maxLength The most characters allowed.
 */
export function requiredText(label, maxLength) {
  const required = { error: `Enter the ${label}.` };
  return z
    .string(required)
    .trim()
    .min(1, required)
    .max(maxLength, { error: `Use ${maxLength} characters or fewer.` });
}

const MAP_PIN_MESSAGE = "Choose the location on the map again.";

function degrees(limit) {
  return z
    .number({ error: MAP_PIN_MESSAGE })
    .min(-limit, { error: MAP_PIN_MESSAGE })
    .max(limit, { error: MAP_PIN_MESSAGE });
}

/**
 * A point on the map in a JSON body, as { lat, lng } in decimal degrees, such as the one
 * GET /api/geocode/place answers for a gym's address picked from the suggestions.
 */
export const mapPin = z.object(
  { lat: degrees(90), lng: degrees(180) },
  { error: MAP_PIN_MESSAGE },
);

/**
 * Optional text, trimmed. Left out or left blank, it comes back as undefined.
 *
 * @param {number} maxLength The most characters allowed.
 */
export function optionalText(maxLength) {
  return z
    .string({ error: "Enter text here." })
    .trim()
    .max(maxLength, { error: `Use ${maxLength} characters or fewer.` })
    .optional()
    .transform((value) => value || undefined);
}
