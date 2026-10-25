import type { ScoringSettings } from "../../lib/scoringApi.ts";

/**
 * A competition's scoring settings in plain words.
 *
 * @param settings Saved scoring settings.
 * @returns Text like "20% off for each failed attempt, up to 5 attempts".
 */
export function describeScoring({ deductionPercent, maxAttempts }: ScoringSettings): string {
  return `${deductionPercent}% off for each failed attempt, up to ${maxAttempts} ${maxAttempts === 1 ? "attempt" : "attempts"}`;
}

/**
 * What a 100-point problem scores under the settings, for a top on each allowed attempt.
 *
 * @param settings Saved scoring settings.
 * @returns Text like "A 100-point problem scores 100, 80, 60, 40 or 20 points, and 0 if it isn't
 *   topped."
 */
export function scoringExample({ deductionPercent, maxAttempts }: ScoringSettings): string {
  const scores = [...new Set(Array.from({ length: maxAttempts }, (_, failed) => 100 - deductionPercent * failed))];
  const last = scores.pop();
  const listed = scores.length ? `${scores.join(", ")} or ${last}` : String(last);
  return `A 100-point problem scores ${listed} points, and 0 if it isn't topped.`;
}
