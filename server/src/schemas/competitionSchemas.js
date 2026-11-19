import { z } from "zod";
import {
  COMPETITION_DESCRIPTION_MAX_LENGTH,
  COMPETITION_MAX_CAPACITY,
  COMPETITION_MAX_YEARS_AHEAD,
  COMPETITION_NAME_MAX_LENGTH,
  REGISTRATION_STATUSES,
} from "../constants/competitions.js";
import { DIVISION_NAMES } from "../constants/divisions.js";
import {
  SCORING_DEFAULT_ATTEMPTS,
  SCORING_DEFAULT_DEDUCTION,
} from "../constants/scoring.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { START_TIME_PATTERN } from "../utils/competitionStart.js";
import { objectId, optionalText, requiredText } from "./commonFields.js";
import { deductionPercent, lastAttemptScores, maxAttempts } from "./scoringSchemas.js";

const DATE_MESSAGE = "Choose the event date.";
const START_TIME_MESSAGE = "Enter the time the competition starts.";
const END_TIME_MESSAGE = "Enter the time the competition ends.";
const END_ORDER_MESSAGE = "Choose an end time after the start time.";
const CAPACITY_MESSAGE = `Enter the maximum number of participants, from 1 to ${COMPETITION_MAX_CAPACITY}.`;
const DIVISIONS_MESSAGE = "Choose divisions from Open, Beginner, Youth, and Advanced.";

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
 * A time of day on the competition's date, in Toronto time, as 24-hour HH:mm. A time field can add
 * seconds, as in 10:00:00, and they're dropped: a competition starts and ends on a minute.
 */
const timeOfDay = (message) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { error: message })
    .transform((value) => value.replace(/^(\d{2}:\d{2}):\d{2}$/, "$1"))
    .pipe(z.string().regex(START_TIME_PATTERN, { error: "Enter a time like 10:00 or 18:30." }));

/** When the competition starts on its date. */
const startTime = timeOfDay(START_TIME_MESSAGE);

/** When it ends on the same date. Climbers record their own results until then. */
const endTime = timeOfDay(END_TIME_MESSAGE);

/**
 * Refuses an end time that isn't after the start time. HH:mm times sort like the times they are.
 * A time that isn't valid has its own message already, so it isn't compared.
 *
 * @param {{ startTime?: unknown, endTime?: unknown }} times The times sent.
 * @param {import("zod").RefinementCtx} context Where the problem is reported.
 */
export function endAfterStart({ startTime: start, endTime: end }, context) {
  const valid = (time) => typeof time === "string" && START_TIME_PATTERN.test(time);
  if (valid(start) && valid(end) && end <= start) {
    context.addIssue({ code: "custom", path: ["endTime"], message: END_ORDER_MESSAGE });
  }
}

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
 * The divisions a new competition starts with, from DIVISION_NAMES. A name sent twice counts
 * once, and they come back in that list's order, so the same choice always saves the same way.
 */
const startingDivisions = z
  .array(z.enum(DIVISION_NAMES, { error: DIVISIONS_MESSAGE }), { error: DIVISIONS_MESSAGE })
  .transform((names) => DIVISION_NAMES.filter((name) => names.includes(name)));

/**
 * Body of POST /api/gym-admin/competitions (US-012). Text is trimmed, and keys that aren't
 * listed are dropped, so the client can't set the status, registration state, or creator.
 *
 * startTime is when the competition starts on its date. Until then a Climber sees a countdown and
 * only their registration status (AC-021). endTime is when it ends, later the same day: Climbers
 * record their own results until then, and see a countdown to it while the competition is on.
 *
 * deductionPercent and maxAttempts become the competition's scoring (US-018), with the same rules
 * as PUT .../scoring. Left out, they're 20% and 5 attempts, the values the form starts with.
 *
 * divisions are the competition's first divisions (US-014), none when left out. Registration
 * can't open until a competition has one, since a Climber picks one to register.
 *
 * gymId is only needed by a Gym Admin of more than one gym, and the server accepts it only when
 * it's one of their own active gyms. A competition is held at its gym, so it takes the gym's
 * location and map pin (US-025, US-027), and a location or pin in the body is dropped.
 */
export const createCompetitionSchema = z.object({
  name: requiredText("competition name", COMPETITION_NAME_MAX_LENGTH),
  date: eventDate,
  startTime,
  endTime,
  description: optionalText(COMPETITION_DESCRIPTION_MAX_LENGTH),
  capacity,
  deductionPercent: deductionPercent.default(SCORING_DEFAULT_DEDUCTION),
  maxAttempts: maxAttempts.default(SCORING_DEFAULT_ATTEMPTS),
  divisions: startingDivisions.default([]),
  gymId: objectId("gym").optional(),
}).superRefine(lastAttemptScores).superRefine(endAfterStart);

/**
 * Editable details for PATCH /api/gym-admin/competitions/:competitionId (US-013). The status
 * isn't editable: opening registration publishes a draft (see updateCompetition). Neither are
 * the location and map pin, which come from the competition's gym. publicLeaderboard turns the
 * public leaderboard on or off (US-020 criterion 5).
 */
export const updateCompetitionSchema = z
  .object({
    name: requiredText("competition name", COMPETITION_NAME_MAX_LENGTH).optional(),
    date: eventDate.optional(),
    startTime: startTime.optional(),
    endTime: endTime.optional(),
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
    publicLeaderboard: z
      .boolean({ error: "Choose whether anyone can see the leaderboard without logging in." })
      .optional(),
  })
  .refine((details) => Object.values(details).some((value) => value !== undefined), {
    error: "Change at least one competition detail.",
  })
  .superRefine(endAfterStart);
