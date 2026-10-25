import { z } from "zod";
import {
  SCORING_ATTEMPTS_MAX,
  SCORING_DEDUCTION_MAX,
} from "../constants/scoring.js";
import { largestDeduction } from "../utils/scoringSettings.js";

const DEDUCTION_MESSAGE = `Enter a whole-number percentage from 0 to ${SCORING_DEDUCTION_MAX}.`;
const ATTEMPTS_MESSAGE = `Enter a whole number of attempts from 1 to ${SCORING_ATTEMPTS_MAX}.`;
const SETTINGS = ["deductionPercent", "maxAttempts"];

/** A whole number in a range. Forms often send numbers as text, so "20" is accepted as 20. */
function wholeNumber(min, max, message) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? Number(value) : value,
    z
      .number({ error: message })
      .int({ error: message })
      .min(min, { error: message })
      .max(max, { error: message }),
  );
}

/** The percentage of a problem's points taken off for each failed attempt before a top. */
export const deductionPercent = wholeNumber(0, SCORING_DEDUCTION_MAX, DEDUCTION_MESSAGE);

/** How many attempts each problem allows. */
export const maxAttempts = wholeNumber(1, SCORING_ATTEMPTS_MAX, ATTEMPTS_MESSAGE);

/**
 * Refuses a deduction so large that a top on the last allowed attempt wouldn't score, with the
 * message on deductionPercent. It only checks settings that are valid on their own, so the
 * message never quotes a value that was already refused.
 *
 * @param {{ deductionPercent: number, maxAttempts: number }} settings The parsed body.
 * @param {import("zod").RefinementCtx} ctx The parse, with the issues found so far.
 */
export function lastAttemptScores(settings, ctx) {
  if (ctx.issues.some((issue) => SETTINGS.includes(issue.path?.[0]))) return;
  const largest = largestDeduction(settings.maxAttempts);
  if (settings.deductionPercent > largest) {
    ctx.addIssue({
      code: "custom",
      path: ["deductionPercent"],
      message: `With ${settings.maxAttempts} attempts, the deduction can be at most ${largest}% so a top on the last attempt still scores.`,
    });
  }
}

/**
 * Body of PUT /api/gym-admin/competitions/:competitionId/scoring (US-018): the percentage taken
 * off for each failed attempt and the maximum attempts, the same for every problem. Keys that
 * aren't listed, such as who changed it or when, are dropped; the server records those itself.
 */
export const scoringSettingsSchema = z
  .object({ deductionPercent, maxAttempts })
  .superRefine(lastAttemptScores);
