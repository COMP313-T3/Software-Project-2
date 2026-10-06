import { z } from "zod";
import {
  DEFAULT_PAGE_SIZE,
  GYM_LOCATION_MAX_LENGTH,
  GYM_NAME_MAX_LENGTH,
  GYM_STATUSES,
  MAX_PAGE_SIZE,
} from "../constants/gyms.js";
import { text } from "./accountFields.js";

const STATUS_MESSAGE = `Choose a status: ${GYM_STATUSES.join(", ")}.`;
const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * Body of POST /api/gyms. Text is trimmed, and unlisted keys are dropped.
 * A gym added by an ADMIN is ACTIVE unless a status is sent.
 */
export const createGymSchema = z.object({
  name: text("gym name", GYM_NAME_MAX_LENGTH),
  location: text("gym location", GYM_LOCATION_MAX_LENGTH),
  status: z.enum(GYM_STATUSES, { error: STATUS_MESSAGE }).default("ACTIVE"),
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