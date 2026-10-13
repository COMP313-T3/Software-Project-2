import { Division } from "../models/Division.js";
import { Registration } from "../models/Registration.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { findManagedCompetition } from "./competitionAccess.js";

/** Compares text ignoring case; the same collation as the Division model's unique index. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

/** The Climber details a Gym Admin needs to organize divisions; no address, phone, or birth date. */
export const CLIMBER_FIELDS = "firstName lastName email";

function divisionExists() {
  const message = "This competition already has a division with this name.";
  return new AppError(409, "DIVISION_EXISTS", message, { name: message });
}

function divisionNotInCompetition() {
  // The same answer for a division that doesn't exist and one from another competition.
  return new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
    divisionId: "Choose a division from this competition.",
  });
}

export function notRegistered() {
  return new AppError(
    404,
    "REGISTRATION_NOT_FOUND",
    "This Climber isn't registered for this competition.",
  );
}

/**
 * Shapes a registration for the Gym Admin: who the Climber is, their status, and their division.
 * A division or account that no longer exists comes back as null rather than failing the list.
 */
export function presentRegistration(registration) {
  const climber = registration.climberId;
  const division = registration.divisionId;
  return {
    registrationId: registration._id,
    status: registration.status,
    registeredAt: registration.registeredAt,
    climber: climber?._id
      ? {
          _id: climber._id,
          firstName: climber.firstName,
          lastName: climber.lastName,
          email: climber.email,
        }
      : null,
    division: division?._id ? { _id: division._id, name: division.name } : null,
  };
}

function byClimberName(a, b) {
  const nameOf = (entry) =>
    `${entry.climber?.lastName ?? ""} ${entry.climber?.firstName ?? ""}`;
  return nameOf(a).localeCompare(nameOf(b), "en", { sensitivity: "base" });
}

/**
 * Lists a competition's divisions by name, each with how many registered Climbers it holds
 * (US-014 criteria 1 and 3).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<{ divisions: { _id: unknown, competitionId: unknown, name: string, climberCount: number }[] }>}
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function listDivisions(gyms, competitionId) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");

  const [divisions, counts] = await Promise.all([
    Division.find({ competitionId: competition._id })
      .collation(CASE_INSENSITIVE)
      .sort({ name: 1 })
      .lean(),
    // Aggregations don't convert IDs, so this uses the ObjectId loaded above, not the URL text.
    Registration.aggregate([
      { $match: { competitionId: competition._id } },
      { $group: { _id: "$divisionId", count: { $sum: 1 } } },
    ]),
  ]);

  const countByDivision = new Map(
    counts.map((entry) => [String(entry._id), entry.count]),
  );
  return {
    divisions: divisions.map((division) => ({
      ...division,
      climberCount: countByDivision.get(String(division._id)) ?? 0,
    })),
  };
}

/**
 * Creates a division in one of the user's competitions (US-014 criterion 1).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} userId The Gym Admin, for the log.
 * @param {{ name: string }} details The validated body.
 * @returns {Promise<object>} The new division, with climberCount 0.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, or 409 DIVISION_EXISTS for a name the
 *   competition already uses, ignoring case.
 */
export async function createDivision(gyms, competitionId, userId, { name }) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");

  const duplicate = await Division.findOne(
    { competitionId: competition._id, name },
    "_id",
  )
    .collation(CASE_INSENSITIVE)
    .lean();
  if (duplicate) throw divisionExists();

  let division;
  try {
    division = await Division.create({ competitionId: competition._id, name });
  } catch (error) {
    // Two saves of the same name at once: the unique index stops the second.
    if (error?.code === DUPLICATE_KEY) throw divisionExists();
    throw error;
  }

  logger.info("Division created", {
    divisionId: division.id,
    competitionId: String(competition._id),
    userId,
  });
  return { ...division.toObject(), climberCount: 0 };
}

/**
 * Lists the Climbers registered for one of the user's competitions, by last name, with their
 * registration status and division (US-014 criterion 2).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {{ divisionId?: string }} query Only the Climbers in this division, when given.
 * @returns {Promise<{ climbers: object[], total: number }>}
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function listClimbers(gyms, competitionId, { divisionId } = {}) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");

  // competitionId always comes from the competition the user may manage, so a divisionId from
  // another competition simply matches nothing.
  const filter = { competitionId: competition._id };
  if (divisionId) filter.divisionId = divisionId;

  const registrations = await Registration.find(
    filter,
    "climberId divisionId status registeredAt",
  )
    .populate("climberId", CLIMBER_FIELDS)
    .populate("divisionId", "name")
    .lean();

  const climbers = registrations.map(presentRegistration).sort(byClimberName);
  return { climbers, total: climbers.length };
}

/**
 * Places a registered Climber in a division of the same competition, or moves them to another
 * one (US-014 criteria 3, 4, and 5). Only the registration for this competition changes, so the
 * Climber's other competitions keep their own divisions.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} climberId The Climber's user ID.
 * @param {string} divisionId The division to place them in.
 * @param {string} userId The Gym Admin, for the log.
 * @returns {Promise<object>} The registration, with the Climber and their new division.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, 400 VALIDATION_ERROR when the division isn't one
 *   of this competition's, or 404 REGISTRATION_NOT_FOUND when the Climber isn't registered for it.
 */
export async function assignDivision(
  gyms,
  competitionId,
  climberId,
  divisionId,
  userId,
) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");

  const division = await Division.findOne(
    { _id: divisionId, competitionId: competition._id },
    "name",
  ).lean();
  if (!division) throw divisionNotInCompetition();

  // One atomic update, matched on this competition and this Climber, so it can't touch a
  // registration anywhere else (criterion 5) and can't be left half-saved (NR-004).
  const registration = await Registration.findOneAndUpdate(
    { competitionId: competition._id, climberId },
    { $set: { divisionId: division._id } },
    { returnDocument: "after", runValidators: true },
  )
    .populate("climberId", CLIMBER_FIELDS)
    .populate("divisionId", "name")
    .lean();
  if (!registration) throw notRegistered();

  logger.info("Climber division assigned", {
    registrationId: String(registration._id),
    competitionId: String(competition._id),
    divisionId: String(division._id),
    userId,
  });
  return presentRegistration(registration);
}
