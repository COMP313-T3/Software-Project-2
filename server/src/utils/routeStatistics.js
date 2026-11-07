/**
 * Route statistics from official results (US-022), shared by the Route statistics page and the AI
 * Route Assistant (US-023, US-033), so both always show the same numbers. Plain arithmetic on
 * official results: it reads them and never changes them.
 *
 * For one route, over the Climbers with an official result on it:
 * - completionRate: the share who sent it, from 0 to 1;
 * - averageAttempts: the attempts recorded, on average, sent or not;
 * - flashRate: the share who flashed it (sent on the first attempt), from 0 to 1.
 */

/**
 * One route's statistics.
 *
 * @param {{ attempts: number, sends: number, flash: boolean }[]} results The route's official
 *   results, one per Climber.
 * @returns {{ climbersWithResults: number, sends: number, flashes: number, totalAttempts: number, completionRate: number, averageAttempts: number, flashRate: number } | null}
 *   The statistics, or null when the route has no results yet.
 */
export function routeStatistics(results) {
  if (results.length === 0) return null;
  const sends = results.reduce((total, result) => total + (result.sends === 1 ? 1 : 0), 0);
  const flashes = results.reduce((total, result) => total + (result.flash === true ? 1 : 0), 0);
  const totalAttempts = results.reduce((total, result) => total + (result.attempts ?? 0), 0);
  return {
    climbersWithResults: results.length,
    sends,
    flashes,
    totalAttempts,
    completionRate: sends / results.length,
    averageAttempts: totalAttempts / results.length,
    flashRate: flashes / results.length,
  };
}

/**
 * Every route's statistics at once.
 *
 * @param {{ _id: unknown }[]} routes The routes.
 * @param {{ routeId: unknown, attempts: number, sends: number, flash: boolean }[]} results The
 *   competition's official results.
 * @returns {Map<string, ReturnType<typeof routeStatistics>>} Statistics keyed by route ID, null for
 *   a route without results. Results on other routes are ignored.
 */
export function statisticsByRoute(routes, results) {
  const byRoute = new Map(routes.map((route) => [String(route._id), []]));
  for (const result of results) byRoute.get(String(result.routeId))?.push(result);
  return new Map([...byRoute].map(([routeId, routeResults]) => [routeId, routeStatistics(routeResults)]));
}
