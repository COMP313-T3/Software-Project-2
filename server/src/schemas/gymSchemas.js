import { z } from "zod";
import {
  DEFAULT_PAGE_SIZE,
  GYM_LOCATION_MAX_LENGTH,
  GYM_NAME_MAX_LENGTH,
  GYM_STATUSES,
  MAX_PAGE_SIZE,
} from "../constants/gyms.js";
import { mapPin, requiredText } from "./commonFields.js";

const STATUS_MESSAGE = `Choose a status: ${GYM_STATUSES.join(", ")}.`;
const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Letters from any language count, so international names and numbered addresses pass. */
const LETTER = /\p{L}/u;

/**
 * Required gym text that must include a letter, so it isn't only numbers or symbols. The same
 * rule as the Add gym, Edit gym, and Request Gym Admin access forms.
 *
 * @param {string} label The field's name in the required message, such as "gym name".
 * @param {number} maxLength The most characters allowed.
 * @param {string} message What to say when it has no letter.
 * @returns {import("zod").ZodType<string>} The trimmed text's schema.
 */
export function gymText(label, maxLength, message) {
  return requiredText(label, maxLength).refine((value) => LETTER.test(value), {
    error: message,
  });
}

const gymName = gymText(
  "gym name",
  GYM_NAME_MAX_LENGTH,
  "Gym name must include letters, not only numbers or symbols.",
);
const gymLocation = gymText(
  "gym location",
  GYM_LOCATION_MAX_LENGTH,
  "Location must include letters, not only numbers or symbols.",
);

/**
 * Body of POST /api/gyms. Text is trimmed, and unlisted keys are dropped.
 * A gym added by an ADMIN is ACTIVE unless a status is sent. coordinates is the optional map pin
 * ({ lat, lng }) its competitions use on the Map View and in distance searches.
 */
export const createGymSchema = z.object({
  name: gymName,
  location: gymLocation,
  status: z.enum(GYM_STATUSES, { error: STATUS_MESSAGE }).default("ACTIVE"),
  coordinates: mapPin.optional(),
});

/** Query for GET /api/gyms: an optional status filter and paging. */
export const listGymsQuerySchema = z.object({
  status: z.enum(GYM_STATUSES, { error: STATUS_MESSAGE }).optional(),
  page: z.coerce
    .number({ error: "Page must be a whole number from 1." })
    .int({ error: "Page must be a whole number from 1." })
    .min(1, { error: "Page must be a whole number from 1." })
    .default(1),
  limit: z.coerce
    .number({ error: `Limit must be from 1 to ${MAX_PAGE_SIZE}.` })
    .int({ error: `Limit must be from 1 to ${MAX_PAGE_SIZE}.` })
    .min(1, { error: `Limit must be from 1 to ${MAX_PAGE_SIZE}.` })
    .max(MAX_PAGE_SIZE, { error: `Limit must be from 1 to ${MAX_PAGE_SIZE}.` })
    .default(DEFAULT_PAGE_SIZE),
});

/** Params for GET /api/gyms/:gymId. */
export const gymIdParamsSchema = z.object({
  gymId: z
    .string({ error: "Invalid gym id." })
    .regex(OBJECT_ID, { error: "Invalid gym id." }),
});

/**
 * Body of PATCH /api/gyms/:gymId. At least one editable field is required. coordinates sets the
 * map pin, and null removes it.
 */
export const updateGymSchema = z
  .object({
    name: gymName.optional(),
    location: gymLocation.optional(),
    coordinates: mapPin.nullable().optional(),
  })
  .refine((details) => Object.values(details).some((value) => value !== undefined), {
    error: "Change the gym name or location.",
  });
