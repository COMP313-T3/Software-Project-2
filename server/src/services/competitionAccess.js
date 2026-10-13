import mongoose from "mongoose";
import { Competition } from "../models/Competition.js";
import { AppError } from "../utils/AppError.js";

/**
 * The 404 for a competition the user can't manage. It's the same whether the competition doesn't
 * exist or belongs to another gym, so a Gym Admin can't find out what other gyms run (US-011
 * criterion 5).
 *
 * @returns {AppError} 404 COMPETITION_NOT_FOUND.
 */
export function competitionNotFound() {
  return new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
}

/**
 * Loads a competition only when it belongs to one of the user's active gyms. Every feature that
 * works inside one competition (divisions, Climbers, and later routes and scoring) starts here, so
 * the gym check is written once.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers, from requireGymAdmin.
 * @param {string} competitionId The validated competition ID.
 * @param {string} [fields] The fields to load, as for Model.findOne.
 * @returns {Promise<object>} The competition, as a plain object.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function findManagedCompetition(gyms, competitionId, fields) {
  const competition = await Competition.findOne(
    {
      _id: competitionId,
      // Built by the server from the user's own gyms, so it's trusted past sanitizeFilter.
      gymId: mongoose.trusted({ $in: gyms.map((gym) => gym._id) }),
    },
    fields,
  ).lean();
  if (!competition) throw competitionNotFound();
  return competition;
}
