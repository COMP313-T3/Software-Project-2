import { Competition } from "../models/Competition.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { presentCompetitionDetails } from "./gymAdminDashboardService.js";

/** Compares text ignoring case; the same collation as the Competition model's unique index. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

function competitionExists() {
  const message = "Your gym already has a competition with this name on this date.";
  return new AppError(409, "COMPETITION_EXISTS", message, { name: message });
}

/**
 * Picks the gym a new competition belongs to. It's always one of the user's own active gyms,
 * from requireGymAdmin, never a gym taken on trust from the request.
 *
 * @param {{ _id: unknown, name: string, location: string }[]} gyms The user's active gyms.
 * @param {string | undefined} gymId The gym the client asked for, if any.
 * @returns {{ _id: unknown, name: string, location: string }} The gym.
 * @throws {AppError} 404 GYM_NOT_FOUND when gymId isn't one of the user's gyms, or 400
 *   VALIDATION_ERROR when the user runs several gyms and didn't say which.
 */
function chooseGym(gyms, gymId) {
  if (gymId) {
    const gym = gyms.find((candidate) => String(candidate._id) === gymId);
    // The same 404 as for a gym that doesn't exist, so it reveals nothing about other gyms.
    if (!gym) throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
    return gym;
  }
  if (gyms.length === 1) return gyms[0];

  throw new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
    gymId: "Choose which of your gyms runs this competition.",
  });
}

/**
 * Creates a competition for one of the Gym Admin's gyms (US-012). It starts as a DRAFT with
 * registration CLOSED, so climbers can't see or join it until the Gym Admin is ready (US-013).
 * It's held at its gym, so its location is always the gym's, and its map pin is the gym's too.
 * Its scoring settings are saved with it, recorded as set by the Gym Admin creating it (US-018).
 *
 * @param {{ _id: unknown, name: string, location: string }[]} gyms The active gyms the user
 *   administers, from requireGymAdmin.
 * @param {string} userId The Gym Admin creating it, from the access token.
 * @param {{ name: string, date: Date, description?: string, capacity: number, deductionPercent: number, maxAttempts: number, gymId?: string }} details
 *   The validated body from createCompetitionSchema.
 * @returns {Promise<object>} The new competition, shaped like GET /competitions/:competitionId.
 * @throws {AppError} 404 GYM_NOT_FOUND, 400 VALIDATION_ERROR (see chooseGym), or 409
 *   COMPETITION_EXISTS when the gym already has a competition with this name on this date.
 */
export async function createCompetition(gyms, userId, details) {
  const gym = chooseGym(gyms, details.gymId);
  const { name, date, description, capacity } = details;

  const duplicate = await Competition.findOne({ gymId: gym._id, name, date }, "_id")
    .collation(CASE_INSENSITIVE)
    .lean();
  if (duplicate) throw competitionExists();

  let competition;
  try {
    competition = await Competition.create({
      gymId: gym._id,
      name,
      date,
      location: gym.location,
      description,
      capacity,
      scoring: {
        deductionPercent: details.deductionPercent,
        maxAttempts: details.maxAttempts,
        updatedBy: userId,
        updatedAt: new Date(),
      },
      createdBy: userId,
    });
  } catch (error) {
    // Two saves of the same competition at once: the unique index stops the second.
    if (error?.code === DUPLICATE_KEY) throw competitionExists();
    throw error;
  }

  logger.info("Competition created", {
    competitionId: competition.id,
    gymId: String(gym._id),
    userId,
  });
  return presentCompetitionDetails(competition.toObject(), gyms);
}
