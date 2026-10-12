import { z } from "zod";
import {
  COMPETITION_DESCRIPTION_MAX_LENGTH,
  COMPETITION_LOCATION_MAX_LENGTH,
  COMPETITION_MAX_CAPACITY,
  COMPETITION_MAX_YEARS_AHEAD,
  COMPETITION_NAME_MAX_LENGTH,
  REGISTRATION_STATUSES,
} from "../constants/competitions.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { objectId, optionalText, requiredText } from "./commonFields.js";

const DATE_MESSAGE = "Choose the event date.";
const CAPACITY_MESSAGE = `Enter the maximum number of participants, from 1 to ${COMPETITION_MAX_CAPACITY}.`;

/**
 * The event date as YYYY-MM-DD, from today in Toronto up to COMPETITION_MAX_YEARS_AHEAD years
 * ahead, both when a competition is created and when its date is changed. It becomes the
 * midnight-UTC Date that competition dates are stored as.
 */
const eventDate = z
  .string({ error: DATE_MESSAGE })
  .trim()
  .min(1, { error: DATE_MESSAGE })
  .transform((value, ctx) => {
    const chosen = parseCalendarDate(value);
    if (!chosen) {
      ctx.addIssue({ code: "custom", message: "Enter a real date, like 2026-11-14." });
      return z.NEVER;
    }

    const today = parseCalendarDate(torontoToday()).date;
    if (chosen.date < today) {
      ctx.addIssue({ code: "custom", message: "Choose today or a later date." });
      return z.NEVER;
    }

    const latest = new Date(today);
    latest.setUTCFullYear(latest.getUTCFullYear() + COMPETITION_MAX_YEARS_AHEAD);
    if (chosen.date > latest) {
      ctx.addIssue({
        code: "custom",
        message: `Choose a date within ${COMPETITION_MAX_YEARS_AHEAD} years.`,
      });
      return z.NEVER;
    }
    return chosen.date;
  });

/**
 * The maximum number of participants. Forms often send numbers as text, so "40" is accepted
 * as 40; anything that isn't a whole number in range is refused.
 */
const capacity = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() !== "" ? Number(value) : value,
  z
    .number({ error: CAPACITY_MESSAGE })
    .int({ error: CAPACITY_MESSAGE })
    .min(1, { error: CAPACITY_MESSAGE })
    .max(COMPETITION_MAX_CAPACITY, { error: CAPACITY_MESSAGE }),
);

/**
 * Body of POST /api/gym-admin/competitions (US-012). Text is trimmed, and keys that aren't
 * listed are dropped, so the client can't set the status, registration state, or creator.
 *
 * gymId is only needed by a Gym Admin of more than one gym, and the server accepts it only when
 * it's one of their own active gyms. location is optional: left blank, the gym's location is used.
 */
export const createCompetitionSchema = z.object({
  name: requiredText("competition name", COMPETITION_NAME_MAX_LENGTH),
  date: eventDate,
  location: optionalText(COMPETITION_LOCATION_MAX_LENGTH),
  description: optionalText(COMPETITION_DESCRIPTION_MAX_LENGTH),
  capacity,
  gymId: objectId("gym").optional(),
});

/**
 * Editable details for PATCH /api/gym-admin/competitions/:competitionId (US-013). The status
 * isn't editable: opening registration publishes a draft (see updateCompetition).
 */
export const updateCompetitionSchema = z
  .object({
    name: requiredText("competition name", COMPETITION_NAME_MAX_LENGTH).optional(),
    date: eventDate.optional(),
    location: requiredText("competition location", COMPETITION_LOCATION_MAX_LENGTH).optional(),
    description: z
      .string({ error: "Enter a competition description." })
      .trim()
      .max(COMPETITION_DESCRIPTION_MAX_LENGTH, {
        error: `Use ${COMPETITION_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      })
      .optional(),
    capacity: capacity.optional(),
    registrationStatus: z
      .enum(REGISTRATION_STATUSES, { error: "Choose whether registration is open or closed." })
      .optional(),
  })
  .refine((details) => Object.values(details).some((value) => value !== undefined), {
    error: "Change at least one competition detail.",
  });
