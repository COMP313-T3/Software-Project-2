import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";
import { fetchGymAdminDashboard, getManagedCompetition, type ManagedCompetition, type ManagedCompetitionPage } from "./gymAdminApi.ts";
import { listCompetitionRoutes } from "./routesApi.ts";
import { getRouteStatistics } from "./routeStatisticsApi.ts";
import {
  checkedHistory, checkedHistoryDetail, type HistoricalCompetition, type HistoricalResult,
  type HistoryDetail, type HistoryGateway,
} from "./competitionHistory.ts";

const LIST_LIMIT = 100;
const RESULTS_LIMIT = 20;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function read<T>(path: string, signal: AbortSignal) {
  return withAccessToken(token => apiRequest<T>(path, { signal, headers: { Authorization: `Bearer ${token}` } }));
}
function historicalCompetition(value: ManagedCompetition): HistoricalCompetition {
  if (!value || !["DRAFT", "PUBLISHED", "CANCELLED"].includes(value.status)) throw new Error("Invalid history status.");
  return { competitionId: value._id, gymId: value.gymId, name: value.name, date: value.date, location: value.location, status: value.status };
}
function pageInfo(value: unknown, requestedPage: number, limit: number, items: unknown[]) {
  if (!object(value) || value.page !== requestedPage || value.limit !== limit || !count(value.total) ||
    items.length > limit || (items.length > 0 && (requestedPage - 1) * limit + items.length > value.total)) throw new Error("Invalid history pagination.");
  return { page: requestedPage, limit, total: value.total };
}
function result(value: unknown, competitionId: string): HistoricalResult {
  if (!object(value) || value.competitionId !== competitionId || !text(value.resultId) || !text(value.routeId) || !text(value.climberId) ||
    !count(value.attempts) || ![0, 1].includes(Number(value.sends)) || typeof value.sends !== "number" ||
    typeof value.flash !== "boolean" || !count(value.officialScore)) throw new Error("Invalid historical result.");
  if (value.climber !== null && (!object(value.climber) || value.climber._id !== value.climberId ||
    ![value.climber.firstName, value.climber.lastName].every(name => name === null || typeof name === "string"))) throw new Error("Invalid historical Climber.");
  if (value.route !== null && (!object(value.route) || value.route._id !== value.routeId)) throw new Error("Invalid historical route.");
  if (value.division !== null && (!object(value.division) || !text(value.division.name))) throw new Error("Invalid historical division.");
  const climberName = object(value.climber) ? [value.climber.firstName, value.climber.lastName].filter(Boolean).join(" ") : "";
  return { resultId: value.resultId, competitionId, routeId: value.routeId, climberName: climberName || "Climber unavailable",
    divisionName: object(value.division) ? String(value.division.name) : null, attempts: value.attempts,
    sends: value.sends as 0 | 1, flash: value.flash, officialScore: value.officialScore };
}

/** US024 uses the existing authenticated past-list, saved-result and statistics APIs.
 * No completion status is invented: cancelled and draft records retain their actual status. */
export const historyGateway: HistoryGateway = {
  async list(signal) {
    const dashboard = await fetchGymAdminDashboard(signal);
    if (!dashboard || !Array.isArray(dashboard.gyms)) throw new Error("Invalid history gyms.");
    const competitions: HistoricalCompetition[] = [];
    let page = 1;
    let collectionTotal: number | undefined;
    while (!signal.aborted) {
      const value = await read<ManagedCompetitionPage>(`/api/gym-admin/competitions?period=past&page=${page}&limit=${LIST_LIMIT}`, signal);
      if (!value || !Array.isArray(value.competitions)) throw new Error("Invalid historical competitions.");
      const info = pageInfo(value, page, LIST_LIMIT, value.competitions);
      // Never present a partial/changing multi-page read as the complete history.
      if (collectionTotal !== undefined && info.total !== collectionTotal) throw new Error("History changed while reading pages.");
      collectionTotal = info.total;
      const expectedItems = Math.min(LIST_LIMIT, Math.max(0, collectionTotal - (page - 1) * LIST_LIMIT));
      if (value.competitions.length !== expectedItems) throw new Error("Incomplete history page.");
      competitions.push(...value.competitions.map(historicalCompetition));
      if (page * LIST_LIMIT >= info.total) break;
      if (!value.competitions.length) throw new Error("Incomplete history page.");
      page++;
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return checkedHistory({ gyms: dashboard.gyms.map(gym => ({ gymId: gym._id, name: gym.name })), competitions });
  },
  async get(competitionId, signal, page = 1) {
    const competition = historicalCompetition(await getManagedCompetition(competitionId, signal));
    if (competition.competitionId !== competitionId) throw new Error("Wrong historical competition.");
    const [saved, list] = await Promise.all([
      read<unknown>(`/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/results?page=${page}&limit=${RESULTS_LIMIT}`, signal),
      listCompetitionRoutes(competitionId, signal),
    ]);
    if (!object(saved) || !Array.isArray(saved.results) || !list || !Array.isArray(list.routes)) throw new Error("Invalid history records.");
    const resultsPage = pageInfo(saved, page, RESULTS_LIMIT, saved.results);
    const detail: HistoryDetail = { competition, resultsPage, results: saved.results.map(value => result(value, competitionId)),
      routes: list.routes.map(route => ({ competitionId: route.competitionId, routeId: route.routeId, routeNumber: route.routeNumber,
        ...(route.name === undefined ? {} : { name: route.name }), grade: route.grade, statistics: null })) };
    return checkedHistoryDetail(detail, competition);
  },
  async statistics(competitionId, routeId, signal) {
    return (await getRouteStatistics(competitionId, routeId, signal)).statistics;
  },
};
