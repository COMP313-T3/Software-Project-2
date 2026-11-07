import { Route } from "../models/Route.js";
import { AppError } from "../utils/AppError.js";
import { findManagedCompetition } from "./competitionAccess.js";
import { officialResultsForAnalysis } from "./officialResultService.js";

function routeNotFound() {
  return new AppError(404, "ROUTE_NOT_FOUND", "Route not found.");
}

/**
 * Calculates statistics from the official results for one route of a managed competition (US-022).
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @param {string} routeId The validated route ID.
 * @returns {Promise<{ competitionId: string, statistics: object | null }>} The selected route's
 *   statistics, or null until official results exist.
 */
export async function getRouteStatistics(gyms, competitionId, routeId) {
  const competition = await findManagedCompetition(gyms, competitionId, "_id");
  const route = await Route.findOne({
    _id: routeId,
    competitionId: competition._id,
  }).lean();
  if (!route) throw routeNotFound();

  const results = await officialResultsForAnalysis(competition._id, route._id);

  if (results.length === 0) {
    return { competitionId: String(competition._id), statistics: null };
  }

  const sends = results.reduce((total, result) => total + result.sends, 0);
  const flashes = results.reduce((total, result) => total + Number(result.flash), 0);
  const attempts = results.reduce((total, result) => total + result.attempts, 0);

  return {
    competitionId: String(competition._id),
    statistics: {
      routeId: String(route._id),
      completionRate: sends / results.length,
      averageAttempts: attempts / results.length,
      flashRate: flashes / results.length,
      calculatedAt: new Date().toISOString(),
    },
  };
}
