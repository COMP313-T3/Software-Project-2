import { Route } from "../models/Route.js";
import { AppError } from "../utils/AppError.js";
import { routeStatistics } from "../utils/routeStatistics.js";
import { findManagedCompetition } from "./competitionAccess.js";
import { officialResultsForAnalysis } from "./officialResultService.js";

function routeNotFound() {
  return new AppError(404, "ROUTE_NOT_FOUND", "Route not found.");
}

/**
 * Calculates statistics from the official results for one route of a managed competition (US-022).
 * The calculation is shared with the AI Route Assistant (utils/routeStatistics.js), so the
 * assistant always explains the same numbers this page shows.
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

  const statistics = routeStatistics(
    await officialResultsForAnalysis(competition._id, route._id),
  );
  if (!statistics) {
    return { competitionId: String(competition._id), statistics: null };
  }

  return {
    competitionId: String(competition._id),
    statistics: {
      routeId: String(route._id),
      completionRate: statistics.completionRate,
      averageAttempts: statistics.averageAttempts,
      flashRate: statistics.flashRate,
      calculatedAt: new Date().toISOString(),
    },
  };
}
