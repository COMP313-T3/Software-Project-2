/**
 * TopSend's official scoring (US-018, US-019 criterion 6). It's plain backend arithmetic, the same
 * for every Climber, and never involves AI (FR-012, section 11 of the spec).
 *
 * A send scores the problem's point value, less deductionPercent of that value for each failed
 * attempt before the top. A flash (a send on the first attempt) keeps the full value. A problem
 * not sent, or sent after maxAttempts, scores 0. Scores are whole points, rounded to the nearest.
 */

/**
 * Whether a result is a flash: a send on the first attempt.
 *
 * @param {{ attempts: number, sent: boolean }} result The attempts and whether it was sent.
 * @returns {boolean} True for a flash.
 */
export function isFlash({ attempts, sent }) {
  return sent === true && attempts === 1;
}

/**
 * The official score of one Climber on one problem.
 *
 * @param {{ pointValue?: number, deductionPercent: number, maxAttempts: number }} rules The
 *   problem's point value and the competition's scoring settings.
 * @param {{ attempts: number, sent: boolean }} result The attempts, up to and including the top,
 *   and whether it was sent.
 * @returns {number} The score in whole points, from 0 to the point value.
 */
export function scoreProblem({ pointValue, deductionPercent, maxAttempts }, { attempts, sent }) {
  if (!sent || !Number.isInteger(pointValue) || pointValue <= 0) return 0;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > maxAttempts) return 0;
  // US-018 keeps deductionPercent small enough that a top on the last attempt still scores.
  const keptPercent = Math.max(0, 100 - deductionPercent * (attempts - 1));
  return Math.round((pointValue * keptPercent) / 100);
}

/**
 * A Climber's totals across their results in one competition, for the running score shown after
 * each save and, later, the leaderboard (US-020) and scorecard (US-031).
 *
 * @param {{ attempts: number, sends: number, flash: boolean, officialScore: number }[]} results
 *   The Climber's official results.
 * @returns {{ totalScore: number, sends: number, flashes: number, attempts: number, problemsRecorded: number }}
 */
export function summarizeResults(results) {
  return results.reduce(
    (total, result) => ({
      totalScore: total.totalScore + (result.officialScore ?? 0),
      sends: total.sends + (result.sends ?? 0),
      flashes: total.flashes + (result.flash ? 1 : 0),
      attempts: total.attempts + (result.attempts ?? 0),
      problemsRecorded: total.problemsRecorded + 1,
    }),
    { totalScore: 0, sends: 0, flashes: 0, attempts: 0, problemsRecorded: 0 },
  );
}
