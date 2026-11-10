import mongoose from "mongoose";
import {
  COMPETITION_STATUS,
  REGISTRATION_RECORD_STATUS,
} from "../constants/competitions.js";
import { RESULT_RECORDING, RESULT_SAVE_TRIES, RESULT_SOURCE } from "../constants/results.js";
import { ROLES } from "../constants/roles.js";
import { Competition } from "../models/Competition.js";
import { OfficialResult } from "../models/OfficialResult.js";
import { Registration } from "../models/Registration.js";
import { Route } from "../models/Route.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import {
  competitionNotStarted as notStartedYet,
  hasStarted,
} from "../utils/competitionStart.js";
import { logger } from "../utils/logger.js";
import { isFlash, scoreProblem, summarizeResults } from "../utils/officialScoring.js";
import { describeScoring, savedScoring } from "../utils/scoringSettings.js";
import { findManagedCompetition } from "./competitionAccess.js";
import { notRegistered } from "./divisionService.js";
import { LEADERBOARD_CHANGE, leaderboardChanged } from "./leaderboardEvents.js";
import { rescoreResults, rulesFor } from "./resultScoring.js";

/** Route numbers in the order a climber reads them on the wall: 2 before 10, A2 before A10. */
const NUMBER_ORDER = { locale: "en", strength: 2, numericOrdering: true };

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

const COMPETITION_FIELDS = "gymId name date startTime status scoring";
const CLIMBER_NAME = "firstName lastName";

// ---------- errors ----------

function writeForbidden() {
  return new AppError(
    403,
    "RESULT_WRITE_FORBIDDEN",
    "Only a Gym Administrator can record official results. AI features can't create or change them.",
  );
}

function competitionCancelled() {
  return new AppError(
    409,
    "COMPETITION_CANCELLED",
    "This competition was cancelled, so its results can't be recorded or changed.",
  );
}

function competitionNotStarted(date) {
  return new AppError(
    409,
    "COMPETITION_NOT_STARTED",
    `Results can be recorded from the competition date, ${date}.`,
  );
}

function scoringNotConfigured() {
  return new AppError(
    409,
    "SCORING_NOT_CONFIGURED",
    "Set the competition's scoring before recording results.",
  );
}

function routeNotFound() {
  // The same answer for a route that doesn't exist and one from another competition (criterion 2).
  return new AppError(404, "ROUTE_NOT_FOUND", "Route not found in this competition.");
}

function routeNotScorable(route) {
  return new AppError(
    409,
    "ROUTE_POINTS_MISSING",
    `Give route ${route.routeNumber} a point value before recording results on it.`,
  );
}

function registrationNotConfirmed(status) {
  return new AppError(
    409,
    "REGISTRATION_NOT_CONFIRMED",
    `This Climber's registration is ${status.toLowerCase()}, not confirmed, so they can't have official results.`,
  );
}

function resultNotFound() {
  return new AppError(
    404,
    "RESULT_NOT_FOUND",
    "There's no official result for this Climber on this route yet.",
  );
}

function resultBusy() {
  return new AppError(
    503,
    "RESULT_BUSY",
    "This result is being changed by someone else right now. Refresh it and try again.",
  );
}

function fieldError(field, message) {
  return new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
    [field]: message,
  });
}

// ---------- who may write ----------

/**
 * Only a logged-in Gym Administrator can create, change, or delete an official result (US-019
 * criterion 7, section 11 of the spec). The routes already require it; this check is repeated
 * here so no other code path, such as a future AI feature calling the service, can write one.
 *
 * @param {{ userId?: string, role?: string } | undefined} actor req.auth from requireAuth.
 * @throws {AppError} 403 RESULT_WRITE_FORBIDDEN.
 */
export function assertOfficialResultWriter(actor) {
  if (
    !actor ||
    actor.role !== ROLES.GYM_ADMIN ||
    typeof actor.userId !== "string" ||
    actor.userId.length === 0
  ) {
    throw writeForbidden();
  }
}

// ---------- loading what a result belongs to ----------

/** Today in Toronto, as the midnight-UTC Date that competition dates are stored as. */
function today() {
  return parseCalendarDate(torontoToday()).date;
}

function calendarDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The competition, when it's one of the user's gyms', with its scoring settings. For a change,
 * the competition must not be cancelled, its date must have come, and its scoring must be set.
 */
async function loadCompetition(gyms, competitionId, { forChange = false } = {}) {
  const competition = await findManagedCompetition(gyms, competitionId, COMPETITION_FIELDS);
  const scoring = savedScoring(competition.scoring);
  if (forChange) {
    if (competition.status === COMPETITION_STATUS.CANCELLED) throw competitionCancelled();
    if (competition.date > today()) throw competitionNotStarted(calendarDate(competition.date));
    if (!scoring) throw scoringNotConfigured();
  }
  return { competition, scoring };
}

/** A boulder problem of the same competition (criterion 2). */
async function loadRoute(competition, routeId, { forChange = false } = {}) {
  const route = await Route.findOne(
    { _id: routeId, competitionId: competition._id },
    "routeNumber name grade pointValue official",
  ).lean();
  if (!route) throw routeNotFound();
  if (forChange && (!route.official || !Number.isInteger(route.pointValue))) {
    throw routeNotScorable(route);
  }
  return route;
}

/** A Climber registered for the same competition (criterion 1), with their name and division. */
async function loadRegistration(competition, climberId, { forChange = false } = {}) {
  const registration = await Registration.findOne(
    { competitionId: competition._id, climberId },
    "climberId divisionId status",
  )
    .populate("climberId", CLIMBER_NAME)
    .populate("divisionId", "name")
    .lean();
  if (!registration) throw notRegistered();
  if (forChange && registration.status !== REGISTRATION_RECORD_STATUS.CONFIRMED) {
    throw registrationNotConfirmed(registration.status);
  }
  return registration;
}

/** Everything one Climber's result on one problem needs, checked in the order a page asks. */
async function loadEntry(gyms, { competitionId, climberId, routeId }, options) {
  const { competition, scoring } = await loadCompetition(gyms, competitionId, options);
  const route = await loadRoute(competition, routeId, options);
  const registration = await loadRegistration(competition, climberId, options);
  return { competition, scoring, route, registration, climberId };
}

// ---------- shaping answers ----------

function presentClimber(registration, climberId) {
  const climber = registration.climberId;
  return {
    _id: climber?._id ?? climberId,
    firstName: climber?.firstName ?? null,
    lastName: climber?.lastName ?? null,
    registrationStatus: registration.status,
    division: registration.divisionId?._id
      ? { _id: registration.divisionId._id, name: registration.divisionId.name }
      : null,
  };
}

function presentRoute(route) {
  return {
    _id: route._id,
    routeNumber: route.routeNumber,
    name: route.name ?? null,
    grade: route.grade,
    pointValue: route.pointValue ?? null,
  };
}

/**
 * One official result as the API shows it. sends is the domain contract's 0 or 1; sent is the
 * same as true or false, for forms.
 */
function presentResult(result) {
  return {
    resultId: result._id,
    competitionId: result.competitionId,
    climberId: result.climberId,
    routeId: result.routeId,
    attempts: result.attempts,
    sends: result.sends,
    sent: result.sends === 1,
    flash: result.flash,
    officialScore: result.officialScore,
    scoredWith: result.scoredWith
      ? {
          pointValue: result.scoredWith.pointValue,
          deductionPercent: result.scoredWith.deductionPercent,
          maxAttempts: result.scoredWith.maxAttempts,
        }
      : null,
    source: result.source,
    updatedBy: result.updatedBy,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/** The Climber's totals in the competition, across every problem with a result. */
async function climberTotals(competitionId, climberId) {
  const results = await OfficialResult.find(
    { competitionId, climberId },
    "attempts sends flash officialScore",
  ).lean();
  return summarizeResults(results);
}

/** The answer for one Climber's result on one problem, the same after a read or a change. */
async function presentEntry({ competition, scoring, route, registration, climberId }, result) {
  return {
    competitionId: competition._id,
    climber: presentClimber(registration, climberId),
    route: presentRoute(route),
    scoring: scoring
      ? {
          deductionPercent: scoring.deductionPercent,
          maxAttempts: scoring.maxAttempts,
          label: describeScoring(scoring),
        }
      : null,
    result: result ? presentResult(result) : null,
    attemptsLeft:
      scoring && !(result?.sends === 1)
        ? Math.max(0, scoring.maxAttempts - (result?.attempts ?? 0))
        : 0,
    climberTotal: await climberTotals(competition._id, climberId),
  };
}

function climberName(registration) {
  const climber = registration.climberId;
  return climber?.firstName ? `${climber.firstName} ${climber.lastName}` : "This Climber";
}

function describeResult(entry, result) {
  const attempts = `${result.attempts} ${result.attempts === 1 ? "attempt" : "attempts"}`;
  const outcome = result.flash
    ? "flashed"
    : result.sends === 1
      ? `sent in ${attempts}`
      : `not sent after ${attempts}`;
  return `${climberName(entry.registration)} ${outcome} route ${entry.route.routeNumber}: ${result.officialScore} points.`;
}

// ---------- saving ----------

/**
 * Refuses a flash when the competition's scoring format doesn't record flashes (criterion 4).
 * TopSend's format records them, so this only matters if a format without flashes is added.
 */
function checkRecordable({ flash }) {
  if (flash !== undefined && !RESULT_RECORDING.flash) {
    throw fieldError("flash", "This competition's scoring format doesn't record flashes.");
  }
}

/**
 * Saves a result with the score calculated here (criterion 6), from the next attempts, send, and
 * flash that nextFrom works out from the result as it is now. Each try reads the saved result and
 * writes only if nobody changed it meanwhile, so two judges saving at once never lose or double an
 * attempt, and the unique index stops a second result for the same Climber and problem (NR-004).
 *
 * @returns {Promise<{ result: object, created: boolean }>} The saved result.
 * @throws {AppError} Whatever nextFrom throws, or 503 RESULT_BUSY after RESULT_SAVE_TRIES tries.
 */
async function writeResult(entry, actor, nextFrom) {
  const { competition, scoring, route } = entry;
  const key = { competitionId: competition._id, climberId: entry.climberId, routeId: route._id };
  const scoredWith = rulesFor(scoring, route);

  for (let tryNumber = 0; tryNumber < RESULT_SAVE_TRIES; tryNumber += 1) {
    const current = await OfficialResult.findOne(key).lean();
    const next = nextFrom(current);
    const fields = {
      attempts: next.attempts,
      sends: next.sent ? 1 : 0,
      flash: isFlash(next),
      officialScore: scoreProblem(scoredWith, next),
      scoredWith,
      updatedBy: actor.userId,
    };

    if (!current) {
      try {
        const created = await OfficialResult.create({
          ...key,
          ...fields,
          source: actor.role === ROLES.CLIMBER ? RESULT_SOURCE.CLIMBER : RESULT_SOURCE.GYM_ADMIN,
          createdBy: actor.userId,
          version: 0,
        });
        return { result: created.toObject(), created: true };
      } catch (error) {
        // Another save created it first: read it and try again.
        if (error?.code === DUPLICATE_KEY) continue;
        throw error;
      }
    }

    const updated = await OfficialResult.findOneAndUpdate(
      { _id: current._id, version: current.version },
      { $set: fields, $inc: { version: 1 } },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (updated) return { result: updated, created: false };
  }
  throw resultBusy();
}

/**
 * If the scoring or the problem's points changed while this result was being saved, the score
 * is calculated again, so a save never leaves a score made with old rules.
 */
async function withCurrentRules(entry, saved) {
  const [competition, route] = await Promise.all([
    Competition.findById(entry.competition._id, "scoring").lean(),
    Route.findById(entry.route._id, "pointValue").lean(),
  ]);
  const scoring = savedScoring(competition?.scoring);
  if (!scoring) return saved;
  const rules = rulesFor(scoring, route);
  const used = saved.scoredWith;
  if (
    used.pointValue === rules.pointValue &&
    used.deductionPercent === rules.deductionPercent &&
    used.maxAttempts === rules.maxAttempts
  ) {
    return saved;
  }
  await rescoreResults(entry.competition._id, { routeId: entry.route._id });
  return (await OfficialResult.findById(saved._id).lean()) ?? saved;
}

/**
 * After a save: scores it again if the rules changed meanwhile, logs it, and tells live
 * leaderboards and the Climber's live scorecard.
 *
 * @returns {Promise<object>} The saved result.
 */
async function settleWrite(entry, actor, result, action) {
  const saved = await withCurrentRules(entry, result);
  logger.info(`Official result ${action}`, {
    resultId: String(saved._id),
    competitionId: String(entry.competition._id),
    routeId: String(entry.route._id),
    climberId: String(entry.climberId),
    attempts: saved.attempts,
    sends: saved.sends,
    flash: saved.flash,
    officialScore: saved.officialScore,
    userId: actor.userId,
  });
  // US-020 criterion 3: live leaderboards recalculate from the saved result. US-031: only this
  // Climber's live scorecard changes.
  leaderboardChanged(entry.competition._id, LEADERBOARD_CHANGE.RESULT, {
    climberId: entry.climberId,
  });
  return saved;
}

async function finishWrite(entry, actor, { result, created }, action) {
  const saved = await settleWrite(entry, actor, result, action);
  return {
    created,
    message: describeResult(entry, saved),
    ...(await presentEntry(entry, saved)),
  };
}

/**
 * Deletes the Climber's result on the problem, logs it, and tells live leaderboards and the
 * Climber's live scorecard.
 *
 * @returns {Promise<object | null>} The deleted result, or null when there wasn't one.
 */
async function removeResult(entry, actor) {
  const deleted = await OfficialResult.findOneAndDelete({
    competitionId: entry.competition._id,
    climberId: entry.climberId,
    routeId: entry.route._id,
  }).lean();
  if (!deleted) return null;

  logger.info("Official result deleted", {
    resultId: String(deleted._id),
    competitionId: String(entry.competition._id),
    routeId: String(entry.route._id),
    climberId: String(entry.climberId),
    userId: actor.userId,
  });
  leaderboardChanged(entry.competition._id, LEADERBOARD_CHANGE.RESULT, {
    climberId: entry.climberId,
  });
  return deleted;
}

/**
 * Saves a Climber's whole result on one problem (US-019 criteria 3 to 6): the attempts, whether
 * they sent it, and whether it was a flash. It replaces any saved result, so a judge can correct
 * one. TopSend calculates the official score from the competition's scoring settings and the
 * problem's point value; the client never sends it.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers, from requireGymAdmin.
 * @param {{ competitionId: string, climberId: string, routeId: string }} ids The validated params.
 * @param {{ userId: string, role: string }} actor req.auth, the Gym Admin saving it.
 * @param {{ attempts: number, sent: boolean, flash?: boolean }} details The validated body.
 * @returns {Promise<object>} { created, message, competitionId, climber, route, scoring, result,
 *   attemptsLeft, climberTotal }.
 * @throws {AppError} 403 RESULT_WRITE_FORBIDDEN; 404 COMPETITION_NOT_FOUND, ROUTE_NOT_FOUND or
 *   REGISTRATION_NOT_FOUND; 409 COMPETITION_CANCELLED, COMPETITION_NOT_STARTED,
 *   SCORING_NOT_CONFIGURED, ROUTE_POINTS_MISSING or REGISTRATION_NOT_CONFIRMED; 400
 *   VALIDATION_ERROR when attempts go above the competition's maximum; 503 RESULT_BUSY.
 */
export async function saveResult(gyms, ids, actor, details) {
  assertOfficialResultWriter(actor);
  checkRecordable(details);
  const entry = await loadEntry(gyms, ids, { forChange: true });
  const { maxAttempts } = entry.scoring;
  if (details.attempts > maxAttempts) {
    throw fieldError(
      "attempts",
      `This competition allows up to ${maxAttempts} ${maxAttempts === 1 ? "attempt" : "attempts"} per problem.`,
    );
  }

  const written = await writeResult(entry, actor, () => ({
    attempts: details.attempts,
    sent: details.sent,
  }));
  return finishWrite(entry, actor, written, written.created ? "recorded" : "updated");
}

/**
 * Records one more attempt on a problem (US-019 criterion 3), the way a judge does at the wall,
 * and, when sent is true, that this attempt topped it (criterion 4). A top on the first attempt is
 * a flash. The official score is calculated again (criterion 6).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {{ competitionId: string, climberId: string, routeId: string }} ids The validated params.
 * @param {{ userId: string, role: string }} actor req.auth, the Gym Admin recording it.
 * @param {{ sent: boolean, flash?: boolean }} attempt The validated body.
 * @returns {Promise<object>} The same answer as saveResult.
 * @throws {AppError} As saveResult, and 409 ALREADY_SENT when the problem is already topped, 409
 *   ATTEMPT_LIMIT_REACHED when every allowed attempt is used, or 400 VALIDATION_ERROR for a
 *   flash that isn't on the first attempt.
 */
export async function recordAttempt(gyms, ids, actor, attempt) {
  assertOfficialResultWriter(actor);
  checkRecordable(attempt);
  const entry = await loadEntry(gyms, ids, { forChange: true });
  const { maxAttempts } = entry.scoring;

  const written = await writeResult(entry, actor, (current) => {
    if (current?.sends === 1) {
      throw new AppError(
        409,
        "ALREADY_SENT",
        `${climberName(entry.registration)} already sent route ${entry.route.routeNumber}. To correct it, save the whole result instead.`,
      );
    }
    const attempts = (current?.attempts ?? 0) + 1;
    if (attempts > maxAttempts) {
      throw new AppError(
        409,
        "ATTEMPT_LIMIT_REACHED",
        `${climberName(entry.registration)} has used all ${maxAttempts} attempts on route ${entry.route.routeNumber}.`,
      );
    }
    if (attempt.flash === true && attempts !== 1) {
      throw fieldError(
        "flash",
        `A flash is a send on the first attempt, and this is attempt ${attempts}.`,
      );
    }
    if (attempt.flash === false && attempt.sent && attempts === 1) {
      throw fieldError(
        "flash",
        "A send on the first attempt is a flash. Leave flash out to record it.",
      );
    }
    return { attempts, sent: attempt.sent };
  });
  return finishWrite(entry, actor, written, "attempt recorded");
}

/**
 * Deletes a Climber's official result on one problem, such as one saved for the wrong Climber.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {{ competitionId: string, climberId: string, routeId: string }} ids The validated params.
 * @param {{ userId: string, role: string }} actor req.auth, the Gym Admin deleting it.
 * @returns {Promise<{ message: string, climberTotal: object }>}
 * @throws {AppError} As saveResult, or 404 RESULT_NOT_FOUND.
 */
export async function deleteResult(gyms, ids, actor) {
  assertOfficialResultWriter(actor);
  const entry = await loadEntry(gyms, ids, { forChange: true });
  if (!(await removeResult(entry, actor))) throw resultNotFound();
  return {
    message: `${climberName(entry.registration)}'s result on route ${entry.route.routeNumber} was deleted.`,
    climberTotal: await climberTotals(entry.competition._id, entry.climberId),
  };
}

// ---------- Climbers scoring themselves (US-031) ----------

function selfScoringForbidden() {
  return new AppError(
    403,
    "RESULT_WRITE_FORBIDDEN",
    "Climbers record their own results from their scorecard.",
  );
}

function scoringClosed() {
  return new AppError(
    409,
    "SCORING_CLOSED",
    "This competition is over, so your results can't be changed anymore.",
  );
}

/**
 * Only a logged-in Climber records their own results, and always as the Climber in their access
 * token. The routes already require it; this check keeps any other caller from writing as one.
 *
 * @param {{ userId?: string, role?: string } | undefined} actor req.auth from requireAuth.
 * @throws {AppError} 403 RESULT_WRITE_FORBIDDEN.
 */
export function assertSelfScorer(actor) {
  if (
    !actor ||
    actor.role !== ROLES.CLIMBER ||
    typeof actor.userId !== "string" ||
    actor.userId.length === 0
  ) {
    throw selfScoringForbidden();
  }
}

/**
 * The Climber's own entry on one problem, for a change. Climbers score themselves from the
 * competition's start until the end of the competition day (Toronto time), on a published
 * competition with scoring set, while their place is confirmed, and only on problems that have a
 * point value.
 */
async function loadOwnEntry(climberId, { competitionId, routeId }) {
  const competition = await Competition.findById(competitionId, COMPETITION_FIELDS).lean();
  if (!competition || competition.status === COMPETITION_STATUS.DRAFT) {
    throw new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
  }
  const registration = await Registration.findOne(
    { competitionId: competition._id, climberId },
    "climberId divisionId status",
  ).lean();
  if (!registration) {
    throw new AppError(
      404,
      "REGISTRATION_NOT_FOUND",
      "You're not registered for this competition, so you can't record results for it.",
    );
  }
  const route = await loadRoute(competition, routeId);

  if (competition.status === COMPETITION_STATUS.CANCELLED) throw competitionCancelled();
  if (!hasStarted(competition)) {
    throw notStartedYet(competition, "You can record your results then.");
  }
  if (competition.date < today()) throw scoringClosed();
  const scoring = savedScoring(competition.scoring);
  if (!scoring) {
    throw new AppError(
      409,
      "SCORING_NOT_CONFIGURED",
      "The gym hasn't set up scoring for this competition yet, so results can't be recorded.",
    );
  }
  if (registration.status !== REGISTRATION_RECORD_STATUS.CONFIRMED) {
    throw new AppError(
      409,
      "REGISTRATION_NOT_CONFIRMED",
      "Your place isn't confirmed, so you can't record results yet.",
    );
  }
  if (!route.official || !Number.isInteger(route.pointValue)) {
    throw new AppError(
      409,
      "ROUTE_POINTS_MISSING",
      `Problem ${route.routeNumber} doesn't have a point value yet, so it can't be scored.`,
    );
  }
  return { competition, scoring, route, registration, climberId };
}

/**
 * Saves the logged-in Climber's own result on one problem (US-031): their attempts, and whether
 * they sent it on the last one. It replaces any saved result, so the Climber can add an attempt,
 * record a send, or undo a mistake. TopSend works out the flash and the score from the
 * competition's scoring settings, exactly as for a Gym Administrator.
 *
 * @param {{ userId: string, role: string }} actor req.auth, the Climber.
 * @param {{ competitionId: string, routeId: string }} ids The validated params.
 * @param {{ attempts: number, sent: boolean }} details The validated body.
 * @returns {Promise<{ created: boolean }>} Whether this was the first result on the problem.
 * @throws {AppError} 403 RESULT_WRITE_FORBIDDEN; 404 COMPETITION_NOT_FOUND,
 *   REGISTRATION_NOT_FOUND or ROUTE_NOT_FOUND; 409 COMPETITION_CANCELLED,
 *   COMPETITION_NOT_STARTED, SCORING_CLOSED, SCORING_NOT_CONFIGURED, REGISTRATION_NOT_CONFIRMED
 *   or ROUTE_POINTS_MISSING; 400 VALIDATION_ERROR when attempts go above the competition's
 *   maximum; 503 RESULT_BUSY.
 */
export async function saveOwnResult(actor, ids, details) {
  assertSelfScorer(actor);
  const entry = await loadOwnEntry(actor.userId, ids);
  const { maxAttempts } = entry.scoring;
  if (details.attempts > maxAttempts) {
    throw fieldError(
      "attempts",
      `This competition allows up to ${maxAttempts} ${maxAttempts === 1 ? "attempt" : "attempts"} per problem.`,
    );
  }

  const written = await writeResult(entry, actor, () => ({
    attempts: details.attempts,
    sent: details.sent,
  }));
  const action = written.created ? "recorded by the Climber" : "updated by the Climber";
  await settleWrite(entry, actor, written.result, action);
  return { created: written.created };
}

/**
 * Clears the logged-in Climber's own result on one problem (US-031), such as when they undo
 * their only attempt.
 *
 * @param {{ userId: string, role: string }} actor req.auth, the Climber.
 * @param {{ competitionId: string, routeId: string }} ids The validated params.
 * @returns {Promise<void>}
 * @throws {AppError} As saveOwnResult, or 404 RESULT_NOT_FOUND.
 */
export async function deleteOwnResult(actor, ids) {
  assertSelfScorer(actor);
  const entry = await loadOwnEntry(actor.userId, ids);
  if (!(await removeResult(entry, actor))) {
    throw new AppError(
      404,
      "RESULT_NOT_FOUND",
      "You haven't recorded a result on this problem yet.",
    );
  }
}

// ---------- reading ----------

/**
 * One Climber's result on one problem, for the result entry form. result is null until one is
 * saved.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {{ competitionId: string, climberId: string, routeId: string }} ids The validated params.
 * @returns {Promise<object>} { competitionId, climber, route, scoring, result, attemptsLeft,
 *   climberTotal }.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, ROUTE_NOT_FOUND or REGISTRATION_NOT_FOUND.
 */
export async function getResult(gyms, ids) {
  const entry = await loadEntry(gyms, ids);
  const result = await OfficialResult.findOne({
    competitionId: entry.competition._id,
    climberId: entry.climberId,
    routeId: entry.route._id,
  }).lean();
  return presentEntry(entry, result);
}

/** Why results can't be recorded yet, in the order the Gym Admin can fix them. */
function blockers(competition, scoring, climbers, routes) {
  const reasons = [];
  if (competition.status === COMPETITION_STATUS.CANCELLED) {
    reasons.push("The competition was cancelled.");
  }
  if (competition.date > today()) {
    reasons.push(`Results can be recorded from the competition date, ${calendarDate(competition.date)}.`);
  }
  if (!scoring) reasons.push("Set the competition's scoring.");
  if (routes.length === 0) reasons.push("Add the competition's routes.");
  const unscored = routes.filter((route) => !Number.isInteger(route.pointValue)).length;
  if (unscored > 0) {
    reasons.push(`${unscored} ${unscored === 1 ? "route has" : "routes have"} no point value yet.`);
  }
  if (climbers.length === 0) reasons.push("No Climber has a confirmed registration yet.");
  return reasons;
}

function byName(a, b) {
  const nameOf = (climber) => `${climber.lastName ?? ""} ${climber.firstName ?? ""}`;
  return nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" });
}

/**
 * The choices for the result entry form (US-019 criteria 1 and 2): the Climbers with a confirmed
 * registration and the competition's problems, with the scoring rules and what's recorded.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<object>} { competition, scoring, canRecord, climbers, routes }.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function getEntryOptions(gyms, competitionId) {
  const { competition, scoring } = await loadCompetition(gyms, competitionId);
  const [registrations, routes] = await Promise.all([
    Registration.find(
      { competitionId: competition._id, status: REGISTRATION_RECORD_STATUS.CONFIRMED },
      "climberId divisionId status",
    )
      .populate("climberId", CLIMBER_NAME)
      .populate("divisionId", "name")
      .lean(),
    Route.find({ competitionId: competition._id }, "routeNumber name grade pointValue")
      .collation(NUMBER_ORDER)
      .sort({ routeNumber: 1, _id: 1 })
      .lean(),
  ]);

  const climbers = registrations
    .filter((registration) => registration.climberId?._id)
    .map((registration) => presentClimber(registration, registration.climberId._id))
    .sort(byName);
  const reasons = blockers(competition, scoring, climbers, routes);

  return {
    competition: {
      _id: competition._id,
      name: competition.name,
      date: calendarDate(competition.date),
      status: competition.status,
    },
    scoring: scoring
      ? {
          deductionPercent: scoring.deductionPercent,
          maxAttempts: scoring.maxAttempts,
          label: describeScoring(scoring),
          records: RESULT_RECORDING,
        }
      : null,
    canRecord: { allowed: reasons.length === 0, reasons },
    climbers,
    routes: routes.map(presentRoute),
  };
}

/**
 * The competition's official results, newest change first, optionally for one Climber, one
 * problem, or one division, by page.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {{ climberId?: string, routeId?: string, divisionId?: string, page: number, limit: number }} query
 *   The validated query.
 * @returns {Promise<{ results: object[], total: number, page: number, limit: number }>}
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function listResults(gyms, competitionId, { climberId, routeId, divisionId, page, limit }) {
  const { competition } = await loadCompetition(gyms, competitionId);
  const filter = { competitionId: competition._id };
  if (routeId) filter.routeId = routeId;
  if (divisionId) {
    const inDivision = await Registration.distinct("climberId", {
      competitionId: competition._id,
      divisionId,
    });
    const ids = climberId
      ? inDivision.filter((id) => String(id) === climberId)
      : inDivision;
    // Built by the server from stored IDs, so the operator is trusted past sanitizeFilter.
    filter.climberId = mongoose.trusted({ $in: ids });
  } else if (climberId) {
    filter.climberId = climberId;
  }

  const [results, total] = await Promise.all([
    OfficialResult.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    OfficialResult.countDocuments(filter),
  ]);

  const climberIds = [...new Set(results.map((result) => String(result.climberId)))];
  const routeIds = [...new Set(results.map((result) => String(result.routeId)))];
  const [climbers, routes, registrations] = await Promise.all([
    // Built by the server from the results just loaded, so the operators are trusted.
    User.find({ _id: mongoose.trusted({ $in: climberIds }) }, CLIMBER_NAME).lean(),
    Route.find(
      {
        _id: mongoose.trusted({ $in: routeIds }),
        competitionId: competition._id,
      },
      "routeNumber name grade pointValue",
    ).lean(),
    Registration.find(
      { competitionId: competition._id, climberId: mongoose.trusted({ $in: climberIds }) },
      "climberId divisionId",
    )
      .populate("divisionId", "name")
      .lean(),
  ]);
  const climbersById = new Map(climbers.map((climber) => [String(climber._id), climber]));
  const routesById = new Map(routes.map((route) => [String(route._id), route]));
  const divisionsByClimber = new Map(
    registrations.map((registration) => [String(registration.climberId), registration.divisionId]),
  );

  return {
    results: results.map((result) => {
      const climber = climbersById.get(String(result.climberId));
      const route = routesById.get(String(result.routeId));
      const division = divisionsByClimber.get(String(result.climberId));
      return {
        ...presentResult(result),
        climber: climber
          ? { _id: climber._id, firstName: climber.firstName, lastName: climber.lastName }
          : null,
        division: division?._id ? { _id: division._id, name: division.name } : null,
        route: route ? presentRoute(route) : null,
      };
    }),
    total,
    page,
    limit,
  };
}

/**
 * A competition's official results for features that only read them, such as route statistics
 * (US-022) and the AI Route Assistant (US-023, US-033). The records are frozen copies, so nothing
 * that uses them can change an official result (US-019 criterion 7). The caller must already
 * have checked that the user may see this competition.
 *
 * @param {import("mongoose").Types.ObjectId | string} competitionId The competition.
 * @param {import("mongoose").Types.ObjectId | string} [routeId] An optional route to scope to.
 * @returns {Promise<ReadonlyArray<Readonly<{ routeId: string, climberId: string, attempts: number, sends: number, flash: boolean, officialScore: number }>>>}
 */
export async function officialResultsForAnalysis(competitionId, routeId) {
  const results = await OfficialResult.find(
    { competitionId, ...(routeId === undefined ? {} : { routeId }) },
    "routeId climberId attempts sends flash officialScore",
  ).lean();
  return Object.freeze(
    results.map((result) =>
      Object.freeze({
        routeId: String(result.routeId),
        climberId: String(result.climberId),
        attempts: result.attempts,
        sends: result.sends,
        flash: result.flash,
        officialScore: result.officialScore,
      }),
    ),
  );
}
