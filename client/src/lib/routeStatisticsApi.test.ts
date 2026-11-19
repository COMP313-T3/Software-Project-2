import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { getRouteStatistics, statisticsProblem } from "./routeStatisticsApi.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
const snapshot = { competitionId: "event", statistics: { routeId: "route", completionRate: 2 / 3, averageAttempts: 2.5, flashRate: 1 / 3, calculatedAt: "2026-11-06T18:00:00Z" } };
it("reads the scoped authenticated endpoint and passes through the server's fractions", async () => {
  vi.mocked(apiRequest).mockResolvedValue(snapshot); const signal = new AbortController().signal;
  expect(await getRouteStatistics("event", "route", signal)).toEqual(snapshot);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gym-admin/competitions/event/routes/route/statistics", { signal, headers: { Authorization: "Bearer test-token" } });
});
it("encodes both identifiers without changing their association check", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ competitionId: "a/b", statistics: null }); await getRouteStatistics("a/b", "c/d");
  expect(apiRequest).toHaveBeenCalledWith("/api/gym-admin/competitions/a%2Fb/routes/c%2Fd/statistics", expect.any(Object));
});
it("distinguishes missing data from valid zero rates", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ competitionId: "event", statistics: null }).mockResolvedValueOnce({ ...snapshot, statistics: { ...snapshot.statistics, completionRate: 0, flashRate: 0, averageAttempts: 0 } });
  expect((await getRouteStatistics("event", "route")).statistics).toBeNull();
  expect((await getRouteStatistics("event", "route")).statistics?.completionRate).toBe(0);
});
it.each([
  { ...snapshot, competitionId: "other" },
  { competitionId: "event" },
  ...[{ routeId: "other" }, { completionRate: 67 }, { flashRate: -1 }, { averageAttempts: NaN }, { calculatedAt: "invalid" }, { calculatedAt: 0 }].map(change => ({ ...snapshot, statistics: { ...snapshot.statistics, ...change } })),
])("rejects mismatched or invalid snapshots %#", async response => {
  vi.mocked(apiRequest).mockResolvedValue(response); await expect(getRouteStatistics("event", "route")).rejects.toThrow();
});
it.each([401, 403, 404, 500])("keeps %i errors readable without revealing internal details", status => {
  const message = statisticsProblem(new ApiError(status, "INTERNAL", "mongodb secret")); expect(message).not.toContain("mongodb"); expect(message.length).toBeGreaterThan(15);
});
