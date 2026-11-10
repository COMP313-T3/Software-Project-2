import { COMPETITION_STATUS, REGISTRATION_RECORD_STATUS } from "../constants/competitions.js";
import {
  SCORECARD_ROUTE_STATUS,
  SCORECARD_ROUTE_STATUS_LABELS,
  SELF_SCORING_REASON,
} from "../constants/scorecard.js";
import { AppError } from "./AppError.js";
import { hasStarted, startsAtOf, startTimeOf } from "./competitionStart.js";
import { describeScoring, savedScoring } from "./scoringSettings.js";

/**
 * The Climber's digital scorecard (US-031), built from what the service read. Plain code with no
 * database, so the rules are tested on their own. It only reads official results and never
 * changes them.
 */

const ACTIVE_GYM = "ACTIVE";

/** Route numbers in the order a climber reads them on the wall: 2 before 10, A2 before A10. */
const NUMBER_ORDER = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const REGISTRATION_LABELS = Object.freeze({
  [REGISTRATION_RECORD_STATUS.CONFIRMED]: "Confirmed",
  [REGISTRATION_RECORD_STATUS.WAITLIST]: "On the waitlist",
  [REGISTRATION_RECORD_STATUS.PENDING]: "Pending",
});

function competitionNotFound() {
  return new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
}

function notRegistered() {
  return new AppError(
    404,
    "REGISTRATION_NOT_FOUND",
    "You're not registered for this competition, so you don't have a scorecard for it.",
  );
}

/**
 * Who may see a scorecard (US-031 criterion 5): only a Climber registered for the competition, and
 * only their own, since the registration is looked up with the Climber from the access token.
 *
 * - A missing competition or a DRAFT answers 404 COMPETITION_NOT_FOUND, as discovery does.
 * - A Climber who isn't registered gets 404 REGISTRATION_NOT_FOUND for a competition they could
 *   discover, and the same 404 COMPETITION_NOT_FOUND for one they couldn't (a cancelled
 *   competition or an inactive gym), so this reveals nothing discovery doesn't (as US-029).
 * - A registered Climber keeps their scorecard even when the competition is later cancelled or its
 *   gym deactivated, so their official results stay visible to them.
 *
 * @param {{ competition: object | null, gym: object | null, registration: object | null }} found
 * @throws {AppError} 404 COMPETITION_NOT_FOUND or 404 REGISTRATION_NOT_FOUND.
 */
export function assertScorecardAccess({ competition, gym, registration }) {
  if (!competition || competition.status === COMPETITION_STATUS.DRAFT) throw competitionNotFound();
  if (registration) return;
  const discoverable =
    competition.status === COMPETITION_STATUS.PUBLISHED && gym?.status === ACTIVE_GYM;
  throw discoverable ? notRegistered() : competitionNotFound();
}

function routeStatusOf(result) {
  if (!result) return SCORECARD_ROUTE_STATUS.NOT_ATTEMPTED;
  if (result.sends === 1) {
    return result.flash ? SCORECARD_ROUTE_STATUS.FLASHED : SCORECARD_ROUTE_STATUS.SENT;
  }
  return result.attempts > 0
    ? SCORECARD_ROUTE_STATUS.ATTEMPTED
    : SCORECARD_ROUTE_STATUS.NOT_ATTEMPTED;
}

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

/** One problem on the scorecard, with the Climber's official result on it, or null without one. */
function presentRoute(route, result, scoring) {
  const status = routeStatusOf(result);
  const completed =
    status === SCORECARD_ROUTE_STATUS.FLASHED || status === SCORECARD_ROUTE_STATUS.SENT;
  return {
    routeId: String(route._id),
    routeNumber: route.routeNumber,
    name: route.name || null,
    grade: route.grade,
    pointValue: Number.isInteger(route.pointValue) ? route.pointValue : null,
    status,
    statusLabel: SCORECARD_ROUTE_STATUS_LABELS[status],
    completed,
    result: result
      ? {
          attempts: result.attempts,
          sends: result.sends,
          sent: result.sends === 1,
          flash: result.flash === true,
          officialScore: result.officialScore,
          attemptsLeft: scoring && !completed ? Math.max(0, scoring.maxAttempts - result.attempts) : 0,
          updatedAt: isoOrNull(result.updatedAt),
        }
      : null,
  };
}

/**
 * Whether the Climber can record their own results right now, and if not, why: from the
 * competition's start until the end of the competition day. The same rules the server applies
 * when they save one (officialResultService.js), in the same order.
 */
function selfScoringOf(competition, registration, scoring, today, now) {
  const closed = (reason) => ({ open: false, reason });
  if (competition.status === COMPETITION_STATUS.CANCELLED) {
    return closed(SELF_SCORING_REASON.CANCELLED);
  }
  if (competition.date > today) return closed(SELF_SCORING_REASON.NOT_STARTED);
  if (competition.date < today) return closed(SELF_SCORING_REASON.CLOSED);
  if (!hasStarted(competition, now)) return closed(SELF_SCORING_REASON.NOT_STARTED);
  if (!scoring) return closed(SELF_SCORING_REASON.NO_SCORING);
  if (registration.status !== REGISTRATION_RECORD_STATUS.CONFIRMED) {
    return closed(SELF_SCORING_REASON.NOT_CONFIRMED);
  }
  return { open: true, reason: null };
}

/**
 * Builds the scorecard: every official problem of the competition, by route number, each with the
 * Climber's official result or null when there isn't one yet (US-031 criteria 1 to 3), and the
 * Climber's totals.
 *
 * Only results on the competition's official problems count, the same as on the leaderboard
 * (US-020), so the totals always agree with it. The scores are the ones TopSend calculated when
 * each result was saved; nothing here calculates or changes a score.
 *
 * @param {{ competition: object, gym: object | null, registration: object, routes: object[], results: object[], today: Date, now?: Date }} data
 *   What scorecardService read: the competition, its gym, the Climber's own registration (with its
 *   division and the Climber's name), the competition's routes, the Climber's own official results
 *   in it, today in Toronto as a midnight-UTC Date, and the moment it's built.
 * @returns {object} The scorecard, as GET /api/competitions/:competitionId/scorecard answers it.
 */
export function buildScorecard({ competition, gym, registration, routes, results, today, now = new Date() }) {
  const scoring = savedScoring(competition.scoring);
  const official = routes
    .filter((route) => route.official !== false)
    .sort(
      (a, b) =>
        NUMBER_ORDER.compare(a.routeNumber, b.routeNumber) || String(a._id).localeCompare(String(b._id)),
    );
  const officialIds = new Set(official.map((route) => String(route._id)));
  const resultsByRoute = new Map(
    results
      .filter((result) => officialIds.has(String(result.routeId)))
      .map((result) => [String(result.routeId), result]),
  );

  const scorecardRoutes = official.map((route) =>
    presentRoute(route, resultsByRoute.get(String(route._id)), scoring),
  );
  const counted = [...resultsByRoute.values()];
  const count = (status) => scorecardRoutes.filter((route) => route.status === status).length;
  const completed = scorecardRoutes.filter((route) => route.completed).length;
  const lastResultAt = counted.reduce((latest, result) => {
    const at = result.updatedAt ? new Date(result.updatedAt).getTime() : 0;
    return Math.max(latest, at);
  }, 0);
  const division = registration.divisionId?._id ? registration.divisionId : null;
  const climber = registration.climberId?.firstName ? registration.climberId : null;

  return {
    competition: {
      _id: String(competition._id),
      name: competition.name,
      date: competition.date.toISOString().slice(0, 10),
      startTime: startTimeOf(competition),
      startsAt: startsAtOf(competition).toISOString(),
      location: competition.location ?? null,
      status: competition.status,
      upcoming: competition.date >= today,
      gym: gym ? { _id: String(gym._id), name: gym.name, active: gym.status === ACTIVE_GYM } : null,
    },
    climber: climber ? { firstName: climber.firstName, lastName: climber.lastName ?? "" } : null,
    registration: {
      registrationId: String(registration._id),
      status: registration.status,
      statusLabel: REGISTRATION_LABELS[registration.status] ?? registration.status,
      confirmed: registration.status === REGISTRATION_RECORD_STATUS.CONFIRMED,
      division: division ? { _id: String(division._id), name: division.name } : null,
    },
    scoring: scoring
      ? {
          deductionPercent: scoring.deductionPercent,
          maxAttempts: scoring.maxAttempts,
          label: describeScoring(scoring),
        }
      : null,
    summary: {
      routeCount: scorecardRoutes.length,
      completed,
      unfinished: scorecardRoutes.length - completed,
      flashes: count(SCORECARD_ROUTE_STATUS.FLASHED),
      attempted: count(SCORECARD_ROUTE_STATUS.ATTEMPTED),
      notAttempted: count(SCORECARD_ROUTE_STATUS.NOT_ATTEMPTED),
      totalAttempts: counted.reduce((total, result) => total + (result.attempts ?? 0), 0),
      totalScore: counted.reduce((total, result) => total + (result.officialScore ?? 0), 0),
    },
    selfScoring: selfScoringOf(competition, registration, scoring, today, now),
    routes: scorecardRoutes,
    lastResultAt: lastResultAt ? new Date(lastResultAt).toISOString() : null,
    generatedAt: now.toISOString(),
  };
}
