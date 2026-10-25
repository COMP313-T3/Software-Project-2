import { Competition } from "../models/Competition.js";
import { Division } from "../models/Division.js";
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
 * Saves a new competition's first divisions. When they can't be saved, the competition and any of
 * its divisions are taken back, so a failed create can simply be tried again. Both are removed
 * even if one removal fails, and a removal that fails is logged. This doesn't need a MongoDB
 * transaction, so it also works on a local database without a replica set.
 *
 * @param {import("mongoose").HydratedDocument<object>} competition The competition just created.
 * @param {string[]} names The division names, from DIVISION_PRESETS.
 * @returns {Promise<{ _id: unknown, name: string }[]>} The saved divisions.
 * @throws {unknown} The error that stopped the divisions, after the competition is taken back.
 */
async function addStartingDivisions(competition, names) {
  if (names.length === 0) return [];
  try {
    const divisions = await Division.insertMany(
      names.map((name) => ({ competitionId: competition._id, name })),
    );
    return divisions.map((division) => ({ _id: division._id, name: division.name }));
  } catch (error) {
    const removals = await Promise.allSettled([
      Division.deleteMany({ competitionId: competition._id }),
      Competition.deleteOne({ _id: competition._id }),
    ]);
    ["divisions", "competition"].forEach((removing, index) => {
      const removal = removals[index];
      if (removal.status === "rejected") {
        logger.error("Couldn't take back a competition whose divisions failed", {
          competitionId: competition.id,
          removing,
          error: removal.reason instanceof Error ? removal.reason.message : String(removal.reason),
        });
      }
    });
    throw error;
  }
}

/**
 * Creates a competition for one of the Gym Admin's gyms (US-012). It starts as a DRAFT with
 * registration CLOSED, so climbers can't see or join it until the Gym Admin is ready (US-013).
 * It's held at its gym, so its location is always the gym's, and its map pin is the gym's too.
 * Its scoring settings are saved with it, recorded as set by the Gym Admin creating it (US-018),
 * and so are the divisions the Gym Admin picked, if any (US-014).
 *
 * @param {{ _id: unknown, name: string, location: string }[]} gyms The active gyms the user
 *   administers, from requireGymAdmin.
 * @param {string} userId The Gym Admin creating it, from the access token.
 * @param {{ name: string, date: Date, description?: string, capacity: number, deductionPercent: number, maxAttempts: number, divisions: string[], gymId?: string }} details
 *   The validated body from createCompetitionSchema.
 * @returns {Promise<object>} The new competition, shaped like GET /competitions/:competitionId,
 *   with its divisions as { _id, name }.
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

  const divisions = await addStartingDivisions(competition, details.divisions ?? []);

  logger.info("Competition created", {
    competitionId: competition.id,
    gymId: String(gym._id),
    userId,
    divisions: divisions.length,
  });
  return { ...presentCompetitionDetails(competition.toObject(), gyms), divisions };
}
