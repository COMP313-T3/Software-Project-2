import { COMPETITION_STATUS, REGISTRATION_RECORD_STATUS } from "../constants/competitions.js";
import {
  SCORECARD_ROUTE_STATUS,
  SCORECARD_ROUTE_STATUS_LABELS,
} from "../constants/scorecard.js";
import { AppError } from "./AppError.js";
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
