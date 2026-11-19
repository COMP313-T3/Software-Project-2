import { ApiError } from "./apiClient.ts";
import type { RouteStatistics } from "./routeStatisticsApi.ts";

/** US024 -> FR012. These are view models, not a proposed HTTP response contract.
 * The backend's past query owns the historical date and gym scope. */
export interface HistoryGym { gymId: string; name: string }
export interface HistoricalCompetition {
  competitionId: string;
  gymId: string;
  name: string;
  date: string;
  location: string;
  status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
}
export interface HistoryCollection {
  gyms: HistoryGym[];
  competitions: HistoricalCompetition[];
}
export interface HistoricalResult {
  resultId: string;
  competitionId: string;
  routeId: string;
  climberName: string;
  divisionName: string | null;
  attempts: number;
  sends: 0 | 1;
  flash: boolean;
  officialScore: number;
}
export interface HistoricalRoute {
  competitionId: string;
  routeId: string;
  routeNumber: string;
  name?: string;
  grade: string;
  statistics: RouteStatistics | null;
}
export interface HistoryDetail {
  competition: HistoricalCompetition;
  /** null means unavailable; [] means a successful read with no saved records. */
  results: HistoricalResult[] | null;
  routes: HistoricalRoute[] | null;
  resultsPage?: { page: number; limit: number; total: number };
}
/** The authenticated API adapter lives in competitionHistoryApi.ts.
 * list must return only the actor's past events and assigned gyms; get must enforce
 * the same authorization. UI checks below are defensive, not the security boundary. */
export interface HistoryGateway {
  list(signal: AbortSignal): Promise<HistoryCollection>;
  get(competitionId: string, signal: AbortSignal, page?: number): Promise<HistoryDetail>;
  statistics?(competitionId: string, routeId: string, signal: AbortSignal): Promise<RouteStatistics | null>;
}

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function competition(value: HistoricalCompetition) {
  return value && text(value.competitionId) && text(value.gymId) && text(value.name) && text(value.location) &&
    typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    new Date(value.date).toISOString().slice(0, 10) === value.date;
}
export function checkedHistory(value: HistoryCollection): HistoryCollection {
  if (!value || !Array.isArray(value.gyms) || !Array.isArray(value.competitions)) throw new Error("Invalid history.");
  const gyms = new Set<string>(), events = new Set<string>();
  for (const gym of value.gyms) {
    if (!gym || !text(gym.gymId) || !text(gym.name) || gyms.has(gym.gymId)) throw new Error("Invalid gym scope.");
    gyms.add(gym.gymId);
  }
  for (const event of value.competitions) {
    if (!competition(event) || !gyms.has(event.gymId) || events.has(event.competitionId)) throw new Error("Invalid history scope.");
    events.add(event.competitionId);
  }
  return value;
}
export function checkedHistoryDetail(value: HistoryDetail, expected: HistoricalCompetition): HistoryDetail {
  if (!value || !competition(value.competition) || value.competition.competitionId !== expected.competitionId ||
    value.competition.gymId !== expected.gymId || !(value.results === null || Array.isArray(value.results)) ||
    !(value.routes === null || Array.isArray(value.routes))) throw new Error("Invalid historical competition.");
  const resultIds = new Set<string>(), routeIds = new Set<string>();
  for (const result of value.results ?? []) {
    if (!result || !text(result.resultId) || resultIds.has(result.resultId) || result.competitionId !== expected.competitionId ||
      !text(result.routeId) || !text(result.climberName) || !(result.divisionName === null || text(result.divisionName)) ||
      !count(result.attempts) || ![0, 1].includes(result.sends) || typeof result.flash !== "boolean" || !count(result.officialScore)) throw new Error("Invalid historical results.");
    resultIds.add(result.resultId);
  }
  for (const route of value.routes ?? []) {
    if (!route || route.competitionId !== expected.competitionId || !text(route.routeId) || routeIds.has(route.routeId) ||
      !text(route.routeNumber) || !text(route.grade) || !(route.name === undefined || typeof route.name === "string")) throw new Error("Invalid historical routes.");
    routeIds.add(route.routeId);
    const stats = route.statistics;
    if (stats !== null && (!stats || stats.routeId !== route.routeId ||
      ![stats.completionRate, stats.flashRate].every(rate => Number.isFinite(rate) && rate >= 0 && rate <= 1) ||
      !Number.isFinite(stats.averageAttempts) || stats.averageAttempts < 0 || typeof stats.calculatedAt !== "string" ||
      !Number.isFinite(Date.parse(stats.calculatedAt)))) throw new Error("Invalid historical statistics.");
  }
  return value;
}
export function historyProblem(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Sign in again to continue.";
    if (error.status === 403) return "You don't have access to this competition history.";
    if (error.status === 404) return "This competition is not available in your history.";
  }
  return "Couldn't load competition history. Please try again.";
}
