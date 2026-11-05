import { COMPETITION_STATUS } from "../constants/competitions.js";
import { Competition } from "../models/Competition.js";
import { Gym } from "../models/Gym.js";
import { logger } from "../utils/logger.js";
import { competitionNotFound, findManagedCompetition } from "./competitionAccess.js";

function presentDisplaySettings(competitionId, settings) {
  return {
    competitionId: String(competitionId),
    displaySettings: {
      logo: settings?.logo ?? null,
      background: settings?.background ?? null,
      sponsors: settings?.sponsors ?? [],
    },
  };
}

/**
 * Display settings for one of the Gym Admin's competitions, including a draft preview.
 */
export async function getManagedDisplaySettings(gyms, competitionId) {
  const competition = await findManagedCompetition(
    gyms,
    competitionId,
    "displaySettings",
  );
  return presentDisplaySettings(competition._id, competition.displaySettings);
}

/**
 * Public display settings are available only after the competition is published.
 */
export async function getPublicDisplaySettings(competitionId) {
  const competition = await Competition.findOne(
    { _id: competitionId, status: COMPETITION_STATUS.PUBLISHED },
    "displaySettings gymId",
  ).lean();
  if (!competition) throw competitionNotFound();
  const activeGym = await Gym.findOne(
    { _id: competition.gymId, status: "ACTIVE" },
    "_id",
  ).lean();
  if (!activeGym) throw competitionNotFound();
  return presentDisplaySettings(competition._id, competition.displaySettings);
}

/**
 * Replaces the settings of one of the Gym Admin's competitions.
 */
export async function setDisplaySettings(gyms, competitionId, userId, settings) {
  const competition = await findManagedCompetition(gyms, competitionId, "gymId");
  const updated = await Competition.findOneAndUpdate(
    { _id: competition._id, gymId: competition.gymId },
    { $set: { displaySettings: settings } },
    { returnDocument: "after", runValidators: true, projection: "displaySettings" },
  ).lean();
  if (!updated) throw competitionNotFound();

  logger.info("Competition display settings saved", {
    competitionId: String(competition._id),
    userId,
  });
  return presentDisplaySettings(competition._id, updated.displaySettings);
}
