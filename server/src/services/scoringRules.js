import { SCORING_FORMAT } from "../constants/scoring.js";
import { AppError } from "../utils/AppError.js";

/**
 * The scoring rules themselves, kept apart from the database so result entry (US-019),
 * leaderboards (US-020, US-032), and the AI Route Assistant all score the same way (US-018
 * criteria 3 and 4). Nothing here saves anything: these functions only calculate.
 *
 * A result follows the spec's OfficialResult: { routeId, attempts, sends, flash }. A route counts
 * as topped when sends > 0, and its attempts are the attempts it took.
 */

function routePointsMissing() {
  return new AppError(
    409,
    "ROUTE_POINTS_MISSING",
    "Every route needs a point value before Points scoring can be used.",
  );
}

/**
 * Works out one Climber's score from their official results.
 *
 * @param {Readonly<{ format: string, flashBonus: number }>} rules From loadScoringRules.
 * @param {Map<string, { pointValue?: number }>} routesById The competition's routes, keyed by ID.
 * @param {{ routeId: unknown, attempts: number, sends: number, flash: boolean }[]} results The
 *   Climber's official results in this competition.
 * @returns {{ tops: number, flashes: number, attemptsToTops: number, points: number }} The score.
 *   points is 0 under Tops and attempts.
 * @throws {AppError} 409 ROUTE_POINTS_MISSING when Points scoring meets a topped route with no
 *   point value, rather than guessing one.
 */
export function scoreClimber(rules, routesById, results) {
  const score = { tops: 0, flashes: 0, attemptsToTops: 0, points: 0 };

  for (const result of results) {
    if (!(result.sends > 0)) continue;
    score.tops += 1;
    score.attemptsToTops += result.attempts;
    if (result.flash) score.flashes += 1;

    if (rules.format === SCORING_FORMAT.POINTS) {
      const pointValue = routesById.get(String(result.routeId))?.pointValue;
      if (typeof pointValue !== "number") throw routePointsMissing();
      score.points += pointValue + (result.flash ? rules.flashBonus : 0);
    }
  }
  return score;
}

/**
 * Orders two scores under the competition's rules: negative when a ranks above b, positive when
 * b ranks above a, and 0 for a tie.
 *
 * @param {Readonly<{ format: string }>} rules From loadScoringRules.
 * @param {{ tops: number, attemptsToTops: number, points: number }} a One score.
 * @param {{ tops: number, attemptsToTops: number, points: number }} b The other.
 * @returns {number} The order.
 */
export function compareScores(rules, a, b) {
  if (rules.format === SCORING_FORMAT.POINTS && a.points !== b.points) {
    return b.points - a.points;
  }
  if (a.tops !== b.tops) return b.tops - a.tops;
  return a.attemptsToTops - b.attemptsToTops;
}

/**
 * Ranks Climbers who are scored together, such as one division (criterion 4). Tied Climbers share
 * a rank, and the next rank skips accordingly: 1, 2, 2, 4.
 *
 * @template {{ score: { tops: number, attemptsToTops: number, points: number } }} T
 * @param {Readonly<{ format: string }>} rules From loadScoringRules.
 * @param {T[]} entries The Climbers and their scores.
 * @returns {(T & { rank: number })[]} The entries in ranking order, each with its rank.
 */
export function rankClimbers(rules, entries) {
  const sorted = [...entries].sort((a, b) => compareScores(rules, a.score, b.score));
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || compareScores(rules, sorted[index - 1].score, entry.score) !== 0) {
      rank = index + 1;
    }
    return { ...entry, rank };
  });
}
