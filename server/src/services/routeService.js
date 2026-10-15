import { Route } from "../models/Route.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { findManagedCompetition } from "./competitionAccess.js";

const CASE_INSENSITIVE = { locale: "en", strength: 2 };
const DUPLICATE_KEY = 11000;

function routeExists() {
  const message = "This competition already has a route with this number.";
  return new AppError(409, "ROUTE_EXISTS", message, { routeNumber: message });
}

function routeNotFound() {
  return new AppError(404, "ROUTE_NOT_FOUND", "Route not found.");
}

function presentRoute(route) {
  return {
    routeId: String(route._id),
    competitionId: String(route.competitionId),
    routeNumber: route.routeNumber,
    name: route.name,
    grade: route.grade,
    ...(route.pointValue === undefined ? {} : { pointValue: route.pointValue }),
    ...(route.notes === undefined ? {} : { notes: route.notes }),
    official: route.official,
  };
}

/**
 * Creates an official route for one of the Gym Admin's competitions (US-016).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} userId The Gym Admin, for the log.
 * @param {{ routeNumber: string, name: string, grade: string, pointValue?: number, notes?: string }} details
 *   The validated route details.
 * @returns {Promise<{ routeId: string, competitionId: string, grade: string, official: boolean }>}
 *   The new route's API representation.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, or 409 ROUTE_EXISTS when its number is already
 *   used in the competition.
 */
export async function createRoute(
  gyms,
  competitionId,
  userId,
  details,
) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const duplicate = await Route.findOne(
    { competitionId: competition._id, routeNumber: details.routeNumber },
    "_id",
  )
    .collation(CASE_INSENSITIVE)
    .lean();
  if (duplicate) throw routeExists();

  let route;
  try {
    route = await Route.create({
      competitionId: competition._id,
      routeNumber: details.routeNumber,
      name: details.name,
      grade: details.grade,
      ...(details.pointValue === undefined
        ? {}
        : { pointValue: details.pointValue }),
      ...(details.notes === undefined ? {} : { notes: details.notes }),
      official: true,
    });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) throw routeExists();
    throw error;
  }

  logger.info("Route created", {
    routeId: route.id,
    competitionId: String(competition._id),
    userId,
  });
  return {
    routeId: route.id,
    competitionId: String(route.competitionId),
    grade: route.grade,
    official: route.official,
  };
}

/**
 * Loads a route only when it belongs to the selected competition managed by this Gym Admin
 * (US-017).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} routeId The validated route ID.
 * @returns {Promise<object>} The selected route's API representation.
 * @throws {AppError} 404 when the competition or route isn't in one of the user's gyms.
 */
export async function getRoute(gyms, competitionId, routeId) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const route = await Route.findOne({
    _id: routeId,
    competitionId: competition._id,
  }).lean();
  if (!route) throw routeNotFound();
  return presentRoute(route);
}

/**
 * Updates permitted details on a route in a competition managed by this Gym Admin (US-017).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} routeId The validated route ID.
 * @param {string} userId The Gym Admin, for the log.
 * @param {object} details The validated fields to update.
 * @returns {Promise<object>} The updated route's API representation.
 * @throws {AppError} 404 when the competition or route isn't in one of the user's gyms; 409 when
 *   another route in the competition already uses the selected route number.
 */
export async function updateRoute(gyms, competitionId, routeId, userId, details) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const changes = { ...details };
  const update = { $set: changes };
  if (changes.notes === "") {
    delete update.$set.notes;
    update.$unset = { notes: 1 };
  }

  try {
    const route = await Route.findOneAndUpdate(
      { _id: routeId, competitionId: competition._id },
      update,
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!route) throw routeNotFound();
    logger.info("Route updated", {
      routeId: String(route._id),
      competitionId: String(competition._id),
      userId,
    });
    return presentRoute(route);
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) throw routeExists();
    throw error;
  }
}
