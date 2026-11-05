import { LEADERBOARD_TIEBREAKERS } from "../constants/leaderboard.js";
import { scoreProblem } from "./officialScoring.js";

/**
 * Leaderboard ranking (US-020, US-032, FR-011). Plain backend arithmetic on official results:
 * nothing here reads or trusts anything an AI feature produced (section 11 of the spec).
 */

function emptyTotals() {
  return { totalScore: 0, sends: 0, flashes: 0, attemptsToTops: 0, attempts: 0, problemsRecorded: 0 };
}

/**
 * Each Climber's totals from their official results, scored with the competition's current rules
 * and each problem's current point value, the same calculation result entry uses (US-019). Only
 * results on the competition's official problems count; a result on a problem that isn't one of
 * them is left out.
 *
 * @param {{ climberId: unknown, routeId: unknown, attempts: number, sends: number }[]} results
 *   The competition's official results.
 * @param {{ _id: unknown, pointValue?: number, official?: boolean }[]} routes The competition's
 *   problems.
 * @param {{ deductionPercent: number, maxAttempts: number } | null} scoring The competition's
 *   scoring settings, or null when they aren't set, which scores every result 0.
 * @returns {Map<string, ReturnType<typeof emptyTotals>>} Totals keyed by Climber ID.
 */
export function totalsByClimber(results, routes, scoring) {
  const routesById = new Map(
    routes.filter((route) => route.official !== false).map((route) => [String(route._id), route]),
  );
  const totals = new Map();
  for (const result of results) {
    const route = routesById.get(String(result.routeId));
    if (!route) continue;
    const sent = result.sends === 1;
    const score = scoring
      ? scoreProblem(
          {
            pointValue: route.pointValue,
            deductionPercent: scoring.deductionPercent,
            maxAttempts: scoring.maxAttempts,
          },
          { attempts: result.attempts, sent },
        )
      : 0;
    const key = String(result.climberId);
    const climber = totals.get(key) ?? emptyTotals();
    climber.totalScore += score;
    climber.attempts += result.attempts ?? 0;
    climber.problemsRecorded += 1;
    if (sent && score > 0) {
      climber.sends += 1;
      climber.attemptsToTops += result.attempts;
      if (result.attempts === 1) climber.flashes += 1;
    }
    totals.set(key, climber);
  }
  return totals;
}

/**
 * Compares two Climbers by the tiebreakers, in order. 0 means they're tied on all of them.
 *
 * @param {object} a One Climber's totals.
 * @param {object} b The other's.
 * @returns {number} Negative when a ranks higher, positive when b does.
 */
export function compareStandings(a, b) {
  for (const { key, order } of LEADERBOARD_TIEBREAKERS) {
    const difference = (a[key] ?? 0) - (b[key] ?? 0);
    if (difference !== 0) return order === "desc" ? -difference : difference;
  }
  return 0;
}

function byName(a, b) {
  const nameOf = (entry) => `${entry.lastName ?? ""} ${entry.firstName ?? ""}`;
  return (
    nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" }) ||
    String(a.entryId).localeCompare(String(b.entryId))
  );
}

/**
 * Orders one division's Climbers and gives each a rank (US-020: "order Climbers based on their
 * official scores" and "handle ties"). Climbers equal on every tiebreaker share a rank, and the
 * next rank skips the places they share (standard competition ranking: 1, 2, 2, 4). Tied Climbers
 * are listed by last name, then first name, so the order never changes between updates.
 *
 * @param {{ entryId: unknown, firstName?: string, lastName?: string }[]} entries The division's
 *   Climbers, each with its totals (see totalsByClimber).
 * @returns {object[]} The entries in order, each with rank and tied.
 */
export function rankEntries(entries) {
  const ordered = [...entries].sort((a, b) => compareStandings(a, b) || byName(a, b));
  const ranked = ordered.map((entry, index) => {
    const previous = ordered[index - 1];
    return { ...entry, sameAsPrevious: previous ? compareStandings(previous, entry) === 0 : false };
  });

  let rank = 0;
  return ranked.map((entry, index) => {
    if (!entry.sameAsPrevious) rank = index + 1;
    const next = ranked[index + 1];
    const { sameAsPrevious, ...rest } = entry;
    return { ...rest, rank, tied: sameAsPrevious || Boolean(next?.sameAsPrevious) };
  });
}

/**
 * A competition's standings, one list per division (US-020: "rankings belong to the correct
 * competition and division"). Only CONFIRMED registrations are ranked, each in its own division,
 * so a Climber is ranked once and only against Climbers of the same division. A confirmed Climber
 * with no results yet is listed with 0 points.
 *
 * @param {{ registrations: object[], divisions: object[], routes: object[], results: object[], scoring: object | null }} data
 *   registrations: { _id, climberId: { _id, firstName, lastName }, divisionId }, already only
 *   CONFIRMED ones of this competition. divisions: { _id, name }. routes and results as for
 *   totalsByClimber.
 * @returns {{ _id: unknown, name: string, climberCount: number, standings: object[] }[]} Each
 *   division, by name, with its ranked standings.
 */
export function divisionStandings({ registrations, divisions, routes, results, scoring }) {
  const totals = totalsByClimber(results, routes, scoring);
  const groups = new Map(
    divisions.map((division) => [String(division._id), { division, entries: [] }]),
  );
  