import mongoose from "mongoose";
import { COMPETITION_STATUS } from "../constants/competitions.js";
import { SCORING_FORMAT, SCORING_FORMAT_OPTIONS } from "../constants/scoring.js";
import { Competition } from "../models/Competition.js";
import { Route } from "../models/Route.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { logger } from "../utils/logger.js";
import { competitionNotFound, findManagedCompetition } from "./competitionAccess.js";

function scoringLocked(message, code) {
  return new AppError(409, code, message);
}

/**
 * Counts what the chosen format still needs before results can be entered. Points scoring uses
 * each route's point value (US-016), so routes without one are listed as a warning, not an
 * error: routes can still be added or edited after the format is chosen.
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
  if (!scoring) warnings.push("Choose a scoring format before results are entered.");
  if (routes === 0) warnings.push("Add the competition's routes before results are entered.");
  if (scoring?.format === SCORING_FORMAT.POINTS && routesWithoutPoints > 0) {
    warnings.push(
      `${routesWithoutPoints} ${routesWithoutPoints === 1 ? "route has" : "routes have"} no point value yet. Give every route points before results are entered.`,
    );
  }
  return { routes, routesWithoutPoints, ready: warnings.length === 0, warnings };
}

function presentScoring(competitionId, scoring, readiness) {
  return {
    competitionId: String(competitionId),
    scoring: scoring
      ? {
          format: scoring.format,
          flashBonus: scoring.flashBonus,
          updatedBy: scoring.updatedBy,
          updatedAt: scoring.updatedAt,
        }
      : null,
    readiness,
  };
}

/**
 * The scoring formats a Gym Admin can choose from (US-018 criterion 1).
 *
 * @returns {{ formats: readonly object[] }} Each format's value, label, description, and whether
 *   it uses route point values and a flash bonus.
 */
export function listScoringFormats() {
  return { formats: SCORING_FORMAT_OPTIONS };
}

/**
 * The scoring settings of one of the Gym Admin's competitions, and what's still missing before
 * results can be entered.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<{ competitionId: string, scoring: object | null, readiness: object }>}
 *   scoring is null until a format is chosen.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function getScoring(gyms, competitionId) {
  const competition = await findManagedCompetition(gyms, competitionId, "scoring");
  return presentScoring(
    competition._id,
    competition.scoring,
    await readinessOf(competition._id, competition.scoring),
  );
}

/**
 * Saves the scoring format of one of the Gym Admin's competitions (US-018 criterion 2). One
 * format applies to the whole competition, so every Climber in a division is scored by the same
 * rules (criterion 4). Who changed it and when are recorded by the server.
 *
 * It can't change once the competition is cancelled or its date has passed, so finished events
 * keep the rules their results were scored with.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} userId The Gym Admin, from the access token.
 * @param {{ format: string, flashBonus: number }} settings The validated body.
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
    format: settings.format,
    flashBonus: settings.flashBonus,
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

  logger.info("Scoring format saved", {
    competitionId: String(competition._id),
    format: scoring.format,
    flashBonus: scoring.flashBonus,
    userId,
  });
  return presentScoring(
    competition._id,
    updated.scoring,
    await readinessOf(competition._id, updated.scoring),
  );
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
 * @returns {Promise<Readonly<{ format: string, flashBonus: number }>>} The rules.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, or 409 SCORING_NOT_CONFIGURED when no format has
 *   been chosen yet.
 */
export async function loadScoringRules(competitionId) {
  const competition = await Competition.findById(competitionId, "scoring").lean();
  if (!competition) throw competitionNotFound();
  if (!competition.scoring) {
    throw new AppError(
      409,
      "SCORING_NOT_CONFIGURED",
      "Choose a scoring format for this competition before entering results.",
    );
  }
  return Object.freeze({
    format: competition.scoring.format,
    flashBonus: competition.scoring.flashBonus,
  });
}
