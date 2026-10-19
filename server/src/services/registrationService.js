import mongoose from "mongoose";
import { COMPETITION_STATUS, REGISTRATION_RECORD_STATUS, REGISTRATION_STATUS } from "../constants/competitions.js";
import { Competition } from "../models/Competition.js";
import { Division } from "../models/Division.js";
import { Gym } from "../models/Gym.js";
import { Registration } from "../models/Registration.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { logger } from "../utils/logger.js";
import { competitionNotFound } from "./competitionAccess.js";

function alreadyRegistered() {
  return new AppError(409, "ALREADY_REGISTERED", "You are already registered for this competition.");
}

/**
 * US028: confirm one authenticated Climber in a division of the selected event.
 *
 * All seat decisions and the Registration insert share one MongoDB transaction. An actual write
 * to the competition serializes concurrent signups for that event, including requests handled
 * by different Node processes. The driver's transaction helper retries transient write conflicts.
 * A unique (competitionId, climberId) index is the second line of duplicate protection.
 *
 * No independent division capacity or age/gender restrictions exist in the approved Division
 * model. Eligibility here means an existing division belonging to this competition.
 * Requires a MongoDB replica set or sharded cluster; there is no unsafe standalone fallback.
 */
export async function registerClimber(competitionId, climberId, divisionId) {
  let registration;
  try {
    registration = await mongoose.connection.transaction(async session => {
      const competition = await Competition.findOneAndUpdate(
        { _id: competitionId, status: COMPETITION_STATUS.PUBLISHED },
        { $inc: { registrationVersion: 1 } },
        { session, returnDocument: "after", timestamps: false },
      ).lean();
      if (!competition) throw competitionNotFound();
      const gym = await Gym.findOne({ _id: competition.gymId, status: "ACTIVE" }, "_id").session(session).lean();
      if (!gym) throw competitionNotFound();

      const duplicate = await Registration.findOne({ competitionId: competition._id, climberId }, "_id").session(session).lean();
      if (duplicate) throw alreadyRegistered();
      if (competition.registrationStatus !== REGISTRATION_STATUS.OPEN) {
        throw new AppError(409, "REGISTRATION_CLOSED", "Registration is closed for this competition.");
      }
      if (competition.date < parseCalendarDate(torontoToday()).date) {
        throw new AppError(409, "COMPETITION_FINISHED", "This competition has already taken place.");
      }
      const division = await Division.findOne({ _id: divisionId, competitionId: competition._id }, "_id").session(session).lean();
      if (!division) {
        throw new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", { divisionId: "Choose a division from this competition." });
      }
      const confirmed = await Registration.countDocuments({ competitionId: competition._id, status: REGISTRATION_RECORD_STATUS.CONFIRMED }).session(session);
      if (confirmed >= competition.capacity) {
        throw new AppError(409, "COMPETITION_FULL", "This competition is full. No spaces are available.");
      }
      const [created] = await Registration.create([{
        competitionId: competition._id, climberId, divisionId: division._id,
        status: REGISTRATION_RECORD_STATUS.CONFIRMED, registeredAt: new Date(),
      }], { session });
      return {
        registrationId: String(created._id), status: created.status,
        divisionId: String(created.divisionId), competitionId: String(created.competitionId),
      };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  } catch (error) {
    if (error?.code === 11000) throw alreadyRegistered();
    if (error?.code === 20 && /transaction/i.test(error.message ?? "")) {
      logger.error("Registration requires transaction-capable MongoDB", { competitionId, userId: climberId });
      throw new AppError(503, "REGISTRATION_UNAVAILABLE", "Registration is temporarily unavailable. Please try again later.");
    }
    throw error;
  }
  // Logging only after commit: retries and rollbacks must not announce successful enrollment.
  logger.info("Climber registered for competition", { ...registration, userId: climberId });
  return registration;
}
