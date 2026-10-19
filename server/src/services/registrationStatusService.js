import mongoose from "mongoose";
import {
  COMPETITION_STATUS,
  REGISTRATION_RECORD_STATUS,
} from "../constants/competitions.js";
import { Competition } from "../models/Competition.js";
import { Gym } from "../models/Gym.js";
import { Registration } from "../models/Registration.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { competitionNotFound } from "./competitionAccess.js";

/** Only competitions of ACTIVE gyms are shown to Climbers who haven't registered for them. */
const ACTIVE_GYM = "ACTIVE";

/** What the status page shows about the competition itself. */
const COMPETITION_FIELDS = "gymId name date location status registrationStatus capacity";

/** How each registration state reads on the page (domain contract, US-028, US-029). */
const STATUS_LABELS = Object.freeze({
  [REGISTRATION_RECORD_STATUS.CONFIRMED]: "Confirmed",
  [REGISTRATION_RECORD_STATUS.WAITLIST]: "On the waitlist",
  [REGISTRATION_RECORD_STATUS.PENDING]: "Pending",
});

function notRegistered() {
  return new AppError(
    404,
    "REGISTRATION_NOT_FOUND",
    "You're not registered for this competition.",
  );
}

/**
 * The Climber's place on the waitlist, from 1: how many WAITLIST registrations of the same
 * competition were made before theirs, plus one. Registrations made at the same moment are
 * ordered by ID, so two Climbers never share a place.
 */
async function waitlistPosition(registration) {
  const ahead = await Registration.countDocuments({
    competitionId: registration.competitionId,
    status: REGISTRATION_RECORD_STATUS.WAITLIST,
    // Built by the server from the stored registration, so these operators are trusted past
    // sanitizeFilter.
    $or: [
      { registeredAt: mongoose.trusted({ $lt: registration.registeredAt }) },
      {
        registeredAt: registration.registeredAt,
        _id: mongoose.trusted({ $lt: registration._id }),
      },
    ],
  });
  return ahead + 1;
}

/**
 * The logged-in Climber's registration status for one competition (US-029), with the competition's
 * capacity so the page can show when it's full (criterion 2).
 *
 * Only the Climber's own registration is ever read: the query is matched on the competition and on
 * the user ID from the access token, never on an ID from the request (criterion 4, and FR-009's
 * "registered competitions are associated with the Climber's account").
 *
 * A Climber who registered keeps seeing their status even if the competition is later cancelled or
 * its gym deactivated, so they find out. A Climber who didn't register gets 404
 * REGISTRATION_NOT_FOUND for a competition they could discover, and the same 404
 * COMPETITION_NOT_FOUND as a missing one for a draft or a hidden competition, so this endpoint
 * reveals nothing discovery doesn't (criterion 5).
 *
 * @param {string} userId The Climber, from the access token.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<object>} { competition, registration, capacity }.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND or 404 REGISTRATION_NOT_FOUND.
 */
export async function getRegistrationStatus(userId, competitionId) {
  const [competition, registration] = await Promise.all([
    Competition.findById(competitionId, COMPETITION_FIELDS).lean(),
    Registration.findOne(
      { competitionId, climberId: userId },
      "competitionId status divisionId registeredAt",
    )
      .populate("divisionId", "name")
      .lean(),
  ]);
  if (!competition) throw competitionNotFound();

  const gym = await Gym.findById(competition.gymId, "name status").lean();
  if (!registration) {
    const discoverable =
      competition.status === COMPETITION_STATUS.PUBLISHED && gym?.status === ACTIVE_GYM;
    throw discoverable ? notRegistered() : competitionNotFound();
  }

  const [confirmed, position] = await Promise.all([
    Registration.countDocuments({
      competitionId: competition._id,
      status: REGISTRATION_RECORD_STATUS.CONFIRMED,
    }),
    registration.status === REGISTRATION_RECORD_STATUS.WAITLIST
      ? waitlistPosition(registration)
      : null,
  ]);

  const spacesLeft = Math.max(0, competition.capacity - confirmed);
  const division = registration.divisionId;
  return {
    competition: {
      _id: competition._id,
      name: competition.name,
      date: competition.date.toISOString().slice(0, 10),
      location: competition.location,
      gym: gym ? { _id: gym._id, name: gym.name } : null,
      status: competition.status,
      upcoming: competition.date >= parseCalendarDate(torontoToday()).date,
      registrationStatus: competition.registrationStatus,
    },
    registration: {
      registrationId: registration._id,
      status: registration.status,
      statusLabel: STATUS_LABELS[registration.status] ?? registration.status,
      confirmed: registration.status === REGISTRATION_RECORD_STATUS.CONFIRMED,
      waitlistPosition: position,
      division: division?._id ? { _id: division._id, name: division.name } : null,
      registeredAt: registration.registeredAt,
    },
    capacity: {
      capacity: competition.capacity,
      confirmed,
      spacesLeft,
      full: spacesLeft === 0,
    },
  };
}
