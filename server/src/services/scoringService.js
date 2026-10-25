import mongoose from "mongoose";
import { COMPETITION_STATUS } from "../constants/competitions.js";
import { Competition } from "../models/Competition.js";
import { Route } from "../models/Route.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { logger } from "../utils/logger.js";
import { savedScoring } from "../utils/scoringSettings.js";
import { competitionNotFound, findManagedCompetition } from "./competitionAccess.js";

function scoringLocked(message, code) {
  return new AppError(409, code, message);
}

/**
 * Counts what's still missing before results can be entered. Every problem scores from its point
 * value (US-016), so routes without one are listed as a warning, not an error: routes can still
 * be added or edited after the scoring is set.
 */
async function readinessOf(competitionId, scoring) {
  const [routes, routesWithoutPoints] = await Promise.all([
    Route.countDocuments({ competitionId }),
    Route.countDocuments({
      competitionId,
      pointValue: mongoose.trusted({ $exists: false }),
    }),
  ]);

  const warnings = [];
  if (!scoring) warnings.push("Set the competition's scoring before results are entered.");
  if (routes === 0) warnings.push("Add the competition's routes before results are entered.");
  if (routesWithoutPoints > 0) {
    warnings.push(
      `${routesWithoutPoints} ${routesWithoutPoints === 1 ? "route has" : "routes have"} no point value yet. Give every route points before results are entered.`,
    );
  }
  return { routes, routesWithoutPoints, ready: warnings.length === 0, warnings };
}

async function presentScoring(competitionId, stored) {
  const scoring = savedScoring(stored);
  return {
    competitionId: String(competitionId),
    scoring,
    readiness: await readinessOf(competitionId, scoring),
  };
}

/**
 * The scoring settings of one of the Gym Admin's competitions, and what's still missing before
 * results can be entered.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<{ competitionId: string, scoring: object | null, readiness: object }>}
 *   scoring is { deductionPercent, maxAttempts, updatedBy, updatedAt }, or null when it isn't
 *   set.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function getScoring(gyms, competitionId) {
  const competition = await findManagedCompetition(gyms, competitionId, "scoring");
  return presentScoring(competition._id, competition.scoring);
}

/**
 * Saves the scoring settings of one of the Gym Admin's competitions (US-018 criterion 2). The
 * settings apply to the whole competition, so every Climber in a division is scored by the same
 * rules (criterion 4). Who changed them and when are recorded by the server.
 *
 * They can't change once the competition is cancelled or its date has passed, so finished events
 * keep the rules their results were scored with.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} userId The Gym Admin, from the access token.
 * @param {{ deductionPercent: number, maxAttempts: number }} settings The validated body.
 * @returns {Promise<{ competitionId: string, scoring: object, readiness: object }>}
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, 409 COMPETITION_CANCELLED, or 409
 *   COMPETITION_FINISHED.
 */
export async function setScoring(gyms, competitionId, userId, settings) {
  const competition = await findManagedCompetition(
    gyms,
    competitionId,
    "gymId status date",
  );

  if (competition.status === COMPETITION_STATUS.CANCELLED) {
    throw scoringLocked(
      "A cancelled competition's scoring can't be changed.",
      "COMPETITION_CANCELLED",
    );
  }
  if (competition.date < parseCalendarDate(torontoToday()).date) {
    throw scoringLocked(
      "Scoring can't be changed after the competition date.",
      "COMPETITION_FINISHED",
    );
  }

  const scoring = {
    deductionPercent: settings.deductionPercent,
    maxAttempts: settings.maxAttempts,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  // Matched on the same gym the competition was loaded from, as one atomic update (NR-004).
  const updated = await Competition.findOneAndUpdate(
    { _id: competition._id, gymId: competition.gymId },
    { $set: { scoring } },
    { returnDocument: "after", runValidators: true, projection: "scoring" },
  ).lean();
  if (!updated) throw competitionNotFound();

  logger.info("Scoring settings saved", {
    competitionId: String(competition._id),
    deductionPercent: scoring.deductionPercent,
    maxAttempts: scoring.maxAttempts,
    userId,
  });
  return presentScoring(competition._id, updated.scoring);
}

/**
 * The official scoring rules of a competition, for the features that score results: result entry
 * (US-019), leaderboards (US-020, US-032), and the AI Route Assistant (US-023, US-033). It reads
 * the saved settings and never changes them, and the object it returns is frozen, so nothing that
 * uses it can alter the official rules (US-018 criterion 5).
 *
 * The caller must already have checked that the user may see this competition; this function
 * doesn't, so it can serve Climbers and public leaderboards too.
 *
 * @param {import("mongoose").Types.ObjectId | string} competitionId The competition.
 * @returns {Promise<Readonly<{ deductionPercent: number, maxAttempts: number }>>} The rules.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, or 409 SCORING_NOT_CONFIGURED when the
 *   competition's scoring isn't set.
 */
export async function loadScoringRules(competitionId) {
  const competition = await Competition.findById(competitionId, "scoring").lean();
  if (!competition) throw competitionNotFound();
  const scoring = savedScoring(competition.scoring);
  if (!scoring) {
    throw new AppError(
      409,
      "SCORING_NOT_CONFIGURED",
      "Set the competition's scoring before entering results.",
    );
  }
  return Object.freeze({
    deductionPercent: scoring.deductionPercent,
    maxAttempts: scoring.maxAttempts,
  });
}
