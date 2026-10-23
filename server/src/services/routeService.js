import { Route } from "../models/Route.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { findManagedCompetition } from "./competitionAccess.js";

const CASE_INSENSITIVE = { locale: "en", strength: 2 };
/** Route numbers in the order a climber reads them on the wall: 2 before 10, A2 before A10. */
const NUMBER_ORDER = { ...CASE_INSENSITIVE, numericOrdering: true };
const DUPLICATE_KEY = 11000;
const CLEARABLE_FIELDS = ["name", "notes"];

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
    ...(route.name ? { name: route.name } : {}),
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
 * @param {{ routeNumber: string, name?: string, grade: string, pointValue: number, notes?: string }} details
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
      ...(details.name === undefined ? {} : { name: details.name }),
      grade: details.grade,
      pointValue: details.pointValue,
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
 * Lists every route of one of the Gym Admin's competitions, by route number, so each one can be
 * opened (US-016, US-017 criterion 1).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<{ routes: object[], total: number }>} The routes' API representations.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function listRoutes(gyms, competitionId) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const routes = await Route.find({ competitionId: competition._id })
    .collation(NUMBER_ORDER)
    .sort({ routeNumber: 1, _id: 1 })
    .lean();
  return { routes: routes.map(presentRoute), total: routes.length };
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
 * @param {object} details The validated fields to update. An empty name or notes removes it.
 * @returns {Promise<object>} The updated route's API representation.
 * @throws {AppError} 404 when the competition or route isn't in one of the user's gyms; 409 when
 *   another route in the competition already uses the selected route number.
 */
export async function updateRoute(gyms, competitionId, routeId, userId, details) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const changes = { ...details };
  const cleared = CLEARABLE_FIELDS.filter((field) => changes[field] === "");
  for (const field of cleared) delete changes[field];
  const update = cleared.length
    ? { $set: changes, $unset: Object.fromEntries(cleared.map((field) => [field, 1])) }
    : { $set: changes };

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
