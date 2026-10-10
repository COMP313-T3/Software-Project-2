import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants/pagination.js";

const OBJECT_ID = /^[a-f\d]{24}$/i;
const PAGE_MESSAGE = "Page must be a whole number from 1.";
const LIMIT_MESSAGE = `Limit must be from 1 to ${MAX_PAGE_SIZE}.`;

/**
 * A MongoDB ID, such as a gym's or a competition's, from a route or a query string.
 *
 * @param {string} label What the ID is for, used in the message: "Invalid <label> id."
 */
export function objectId(label) {
  const message = `Invalid ${label} id.`;
  return z.string({ error: message }).regex(OBJECT_ID, { error: message });
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
