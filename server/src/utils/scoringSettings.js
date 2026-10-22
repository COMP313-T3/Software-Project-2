import {
  SCORING_ATTEMPTS_MAX,
  SCORING_DEDUCTION_MAX,
} from "../constants/scoring.js";

/**
 * The largest deduction that still lets a top on the last allowed attempt score points: the
 * deductions for the maxAttempts - 1 failed attempts before it must add up to less than 100%.
 *
 * @param {number} maxAttempts The maximum attempts per problem, from 1.
 * @returns {number} The largest whole percentage allowed, at most SCORING_DEDUCTION_MAX.
 */
export function largestDeduction(maxAttempts) {
  if (maxAttempts <= 1) return SCORING_DEDUCTION_MAX;
  return Math.min(SCORING_DEDUCTION_MAX, Math.ceil(100 / (maxAttempts - 1)) - 1);
}

/**
 * A competition's saved scoring settings, or null when it has none. A stored value without a
 * valid deductionPercent and maxAttempts, such as { format, flashBonus }, counts as none, so
 * nothing is ever scored by rules TopSend doesn't support.
 *
 * @param {unknown} scoring The competition's stored scoring field.
 * @returns {{ deductionPercent: number, maxAttempts: number, updatedBy: unknown, updatedAt: unknown } | null}
 *   The settings, with who saved them and when.
 */
export function savedScoring(scoring) {
  const { deductionPercent, maxAttempts, updatedBy, updatedAt } = scoring ?? {};
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > SCORING_ATTEMPTS_MAX ||
    !Number.isInteger(deductionPercent) ||
    deductionPercent < 0 ||
    deductionPercent > largestDeduction(maxAttempts)
  ) {
    return null;
  }
  return { deductionPercent, maxAttempts, updatedBy, updatedAt };
}

/**
 * Scoring settings in plain words, the way the Gym Admin's pages describe them.
 *
 * @param {{ deductionPercent: number, maxAttempts: number }} settings Saved scoring settings.
 * @returns {string} Text like "20% off for each failed attempt, up to 5 attempts".
 */
export function describeScoring({ deductionPercent, maxAttempts }) {
  return `${deductionPercent}% off for each failed attempt, up to ${maxAttempts} ${maxAttempts === 1 ? "attempt" : "attempts"}`;
}
