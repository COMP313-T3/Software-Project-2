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
