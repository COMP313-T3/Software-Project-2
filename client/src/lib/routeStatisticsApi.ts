import { apiRequest, ApiError } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface RouteStatistics {
  routeId: string;
  completionRate: number;
  averageAttempts: number;
  flashRate: number;
  calculatedAt: string;
}
export interface StatisticsSnapshot {
  competitionId: string;
  statistics: RouteStatistics | null;
}
/** US022 -> FR012. Rates and averages are calculated by the server from official records. */
export async function getRouteStatistics(competitionId: string, routeId: string, signal?: AbortSignal): Promise<StatisticsSnapshot> {
  const result = await withAccessToken(token => apiRequest<StatisticsSnapshot>(
    `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/routes/${encodeURIComponent(routeId)}/statistics`,
    { signal, headers: { Authorization: `Bearer ${token}` } },
  ));
  if (!result || typeof result !== "object" || result.competitionId !== competitionId || !("statistics" in result)) {
    throw new Error("Invalid competition statistics.");
  }
  const s = result.statistics;
  if (s !== null && (
    !s || s.routeId !== routeId ||
    ![s.completionRate, s.flashRate].every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
    !Number.isFinite(s.averageAttempts) || s.averageAttempts < 0 ||
    typeof s.calculatedAt !== "string" || !Number.isFinite(Date.parse(s.calculatedAt))
  )) {
    throw new Error("Invalid route statistics.");
  }
  return result;
}
export function statisticsProblem(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Sign in again to continue.";
    if (error.status === 403) return "You don't have access to statistics for this competition.";
    if (error.status === 404) return "This competition or route is no longer available.";
  }
  return "Couldn't load route statistics. Please try again.";
}
