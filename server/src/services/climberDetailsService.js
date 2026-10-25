import { Registration } from "../models/Registration.js";
import { logger } from "../utils/logger.js";
import { findManagedCompetition } from "./competitionAccess.js";
import { CLIMBER_FIELDS, notRegistered, presentRegistration } from "./divisionService.js";

/**
 * Loads one registration inside a competition the Gym Admin may manage. Only the
 * Climber's organizing details are exposed; account credentials and profile data stay private.
 */
export async function getClimber(gyms, competitionId, climberId) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const registration = await Registration.findOne(
    { competitionId: competition._id, climberId },
    "climberId divisionId status registeredAt",
  )
    .populate("climberId", CLIMBER_FIELDS)
    .populate("divisionId", "name")
    .lean();
  if (!registration) throw notRegistered();
  return presentRegistration(registration);
}

/**
 * Removes only the selected Climber's registration in an authorized competition.
 * A single atomic delete leaves their account, other registrations and the division intact.
 * Missing registrations receive the same 404, including a repeated removal.
 */
export async function removeClimber(gyms, competitionId, climberId, userId) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const registration = await Registration.findOneAndDelete({
    competitionId: competition._id,
    climberId,
  }).lean();
  if (!registration) throw notRegistered();
  logger.info("Climber registration removed", {
    registrationId: String(registration._id),
    competitionId: String(competition._id),
    userId,
  });
}
