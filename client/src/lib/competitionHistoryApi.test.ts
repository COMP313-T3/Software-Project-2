import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { fetchGymAdminDashboard, getManagedCompetition, type ManagedCompetitionDetails } from "./gymAdminApi.ts";
import { listCompetitionRoutes } from "./routesApi.ts";
import { getRouteStatistics } from "./routeStatisticsApi.ts";
import { historyGateway } from "./competitionHistoryApi.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("token") }));
vi.mock("./gymAdminApi.ts", () => ({ fetchGymAdminDashboard: vi.fn(), getManagedCompetition: vi.fn() }));
vi.mock("./routesApi.ts", () => ({ listCompetitionRoutes: vi.fn() }));
vi.mock("./routeStatisticsApi.ts", () => ({ getRouteStatistics: vi.fn() }));
const signal = new AbortController().signal;
const event: ManagedCompetitionDetails = { _id: "event", gymId: "gym", gym: { _id: "gym", name: "North Gym" }, name: "Autumn Open", date: "2026-10-01", location: "Toronto", status: "PUBLISHED", registrationStatus: "CLOSED", capacity: 80, tools: [] };
const result = { resultId: "result", competitionId: "event", climberId: "climber", routeId: "route", attempts: 2, sends: 1, flash: false, officialScore: 80, climber: { _id: "climber", firstName: "Jamie", lastName: "Sample" }, route: { _id: "route", routeNumber: "1" }, division: { _id: "division", name: "Open" } };
const results = { page: 1, limit: 20, total: 1, results: [result] };
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(apiRequest).mockReset();
  vi.mocked(fetchGymAdminDashboard).mockReset().mockResolvedValue({ gyms: [{ _id: "gym", name: "North Gym", location: "Toronto" }], counts: { upcoming: 0, past: 1, drafts: 0 }, upcoming: [] });
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(event);
  vi.mocked(listCompetitionRoutes).mockReset().mockResolvedValue({ routes: [{ routeId: "route", competitionId: "event", routeNumber: "1", grade: "V3", official: true }], total: 1 });
});
it("reads authenticated past competitions in API order and preserves actual status", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ page: 1, limit: 100, total: 2, competitions: [event, { ...event, _id: "cancelled", status: "CANCELLED" }] });
  const scope = await historyGateway.list(signal); expect(scope.competitions.map(value => value.status)).toEqual(["PUBLISHED", "CANCELLED"]);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gym-admin/competitions?period=past&page=1&limit=100", { signal, headers: { Authorization: "Bearer token" } });
});
it("reads further history pages instead of silently dropping events beyond the first page", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ page: 1, limit: 100, total: 101, competitions: Array.from({ length: 100 }, (_, i) => ({ ...event, _id: `event-${i}` })) }).mockResolvedValueOnce({ page: 2, limit: 100, total: 101, competitions: [event] });
  expect((await historyGateway.list(signal)).competitions).toHaveLength(101); expect(apiRequest).toHaveBeenLastCalledWith("/api/gym-admin/competitions?period=past&page=2&limit=100", expect.any(Object));
});
it("rejects a history event associated with a gym outside the assigned scope", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ page: 1, limit: 100, total: 1, competitions: [{ ...event, gymId: "foreign" }] }); await expect(historyGateway.list(signal)).rejects.toThrow();
});
it("reads saved results by page without recalculating scores or fetching all route statistics", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ ...results, page: 2, total: 21 });
  const value = await historyGateway.get("event", signal, 2);
  expect(value.results?.[0]).toMatchObject({ officialScore: 80, attempts: 2, climberName: "Jamie Sample", divisionName: "Open" });
  expect(value.resultsPage).toEqual({ page: 2, limit: 20, total: 21 });
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gym-admin/competitions/event/results?page=2&limit=20", { signal, headers: { Authorization: "Bearer token" } });
  expect(getRouteStatistics).not.toHaveBeenCalled();
});
it("keeps saved scores readable if the Climber or route metadata is missing", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ ...results, results: [{ ...result, climber: null, route: null, division: null }] });
  expect((await historyGateway.get("event", signal)).results?.[0]).toMatchObject({ climberName: "Climber unavailable", officialScore: 80, divisionName: null });
});
it("returns a real empty page without fabricating records", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ page: 1, limit: 20, total: 0, results: [] }); expect((await historyGateway.get("event", signal)).results).toEqual([]);
});
it("stops before reading private results when the competition check is denied", async () => {
  const error = new ApiError(404, "COMPETITION_NOT_FOUND", "Unavailable"); vi.mocked(getManagedCompetition).mockRejectedValueOnce(error);
  await expect(historyGateway.get("event", signal)).rejects.toBe(error); expect(apiRequest).not.toHaveBeenCalled(); expect(listCompetitionRoutes).not.toHaveBeenCalled();
});
it.each([
  { ...results, results: [{ ...result, competitionId: "foreign" }] },
  { ...results, results: [{ ...result, route: { _id: "foreign" } }] },
  { ...results, results: [{ ...result, climber: { ...result.climber, _id: "foreign" } }] },
  { ...results, page: 2 },
])("rejects mismatched saved results or pagination %#", async response => {
  vi.mocked(apiRequest).mockResolvedValue(response); await expect(historyGateway.get("event", signal)).rejects.toThrow();
});
it("does not convert a refused results read into an empty historical result list", async () => {
  const error = new ApiError(403, "FORBIDDEN", "Unavailable"); vi.mocked(apiRequest).mockRejectedValue(error); await expect(historyGateway.get("event", signal)).rejects.toBe(error);
});
it("loads the selected route's statistics with its correct competition and abort signal", async () => {
  vi.mocked(getRouteStatistics).mockResolvedValue({ competitionId: "event", statistics: null }); expect(await historyGateway.statistics!("event", "route", signal)).toBeNull();
  expect(getRouteStatistics).toHaveBeenCalledExactlyOnceWith("event", "route", signal);
});
it("does not silently treat a short history page as a complete collection", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ page: 1, limit: 100, total: 101, competitions: [event] }).mockResolvedValueOnce({ page: 2, limit: 100, total: 101, competitions: [{ ...event, _id: "last" }] });
  await expect(historyGateway.list(signal)).rejects.toThrow();
});
it("does not combine pages from inconsistent history counts", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ page: 1, limit: 100, total: 101, competitions: Array.from({ length: 100 }, (_, i) => ({ ...event, _id: `event-${i}` })) }).mockResolvedValueOnce({ page: 2, limit: 100, total: 102, competitions: [event, { ...event, _id: "last" }] });
  await expect(historyGateway.list(signal)).rejects.toThrow();
});
