import { SCORING_ATTEMPTS_MAX, SCORING_DEDUCTION_MAX } from "../constants/scoring.ts";
import type { SavedScoring } from "./scoringApi.ts";

export const SCORING_FIELDS = ["deductionPercent", "maxAttempts"] as const;
export type ScoringField = typeof SCORING_FIELDS[number];
export type ScoringValues = Record<ScoringField, string>;
export type ScoringErrors = Partial<Record<ScoringField, string>>;

/** The same messages the API sends for these fields. */
export const SCORING_DEDUCTION_MESSAGE = `Enter a whole-number percentage from 0 to ${SCORING_DEDUCTION_MAX}.`;
export const SCORING_ATTEMPTS_MESSAGE = `Enter a whole number of attempts from 1 to ${SCORING_ATTEMPTS_MAX}.`;

/**
 * The largest deduction that still lets a top on the last allowed attempt score points, as the
 * API works it out: the deductions for the failed attempts before it must add up to less than 100%.
 *
 * @param maxAttempts The maximum attempts per problem, from 1.
 * @returns The largest whole percentage allowed.
 */
export function largestDeduction(maxAttempts: number): number {
  if (maxAttempts <= 1) return SCORING_DEDUCTION_MAX;
  return Math.min(SCORING_DEDUCTION_MAX, Math.ceil(100 / (maxAttempts - 1)) - 1);
}

function wholeNumber(text: string, min: number, max: number): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

/**
 * Checks the scoring fields with the API's rules (US-018): a whole-number deduction from 0 to 99,
 * from 1 to 20 attempts, and a deduction small enough that a top on the last attempt still scores.
 *
 * @param values The fields as typed.
 * @returns A message for each field that needs fixing.
 */
export function validateScoring(values: ScoringValues): ScoringErrors {
  const errors: ScoringErrors = {};
  const deduction = wholeNumber(values.deductionPercent, 0, SCORING_DEDUCTION_MAX);
  const attempts = wholeNumber(values.maxAttempts, 1, SCORING_ATTEMPTS_MAX);
  if (deduction === null) errors.deductionPercent = SCORING_DEDUCTION_MESSAGE;
  if (attempts === null) errors.maxAttempts = SCORING_ATTEMPTS_MESSAGE;
  if (deduction !== null && attempts !== null && deduction > largestDeduction(attempts)) {
    errors.deductionPercent = `With ${attempts} attempts, the deduction can be at most ${largestDeduction(attempts)}% so a top on the last attempt still scores.`;
  }
  return errors;
}

/**
 * A competition's saved scoring, or null when it isn't set. Anything without a valid deduction and
 * number of attempts, such as { format, flashBonus }, counts as not set, as it does for the API.
 *
 * @param scoring The scoring the API answered with.
 * @returns The saved scoring, or null.
 */
export function savedScoring(scoring: SavedScoring | null | undefined): SavedScoring | null {
  if (!scoring) return null;
  const { deductionPercent, maxAttempts } = scoring;
  const valid = Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= SCORING_ATTEMPTS_MAX
    && Number.isInteger(deductionPercent) && deductionPercent >= 0 && deductionPercent <= largestDeduction(maxAttempts);
  return valid ? scoring : null;
}
