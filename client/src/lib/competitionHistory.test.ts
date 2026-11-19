import { expect, it } from "vitest";
import { checkedHistory, checkedHistoryDetail, historyProblem, type HistoryCollection, type HistoryDetail } from "./competitionHistory.ts";
import { ApiError } from "./apiClient.ts";
const event = { competitionId: "event", gymId: "gym", name: "Autumn Open", date: "2026-10-01", location: "Toronto" };
const list: HistoryCollection = { gyms: [{ gymId: "gym", name: "North Gym" }], competitions: [event] };
const route = { competitionId: "event", routeId: "route", routeNumber: "1", grade: "V3", statistics: null };
const result = { resultId: "result", competitionId: "event", routeId: "route", climberName: "Jamie Sample", divisionName: "Open", attempts: 1, sends: 1 as const, flash: true, officialScore: 100 };
const detail: HistoryDetail = { competition: event, routes: [route], results: [result] };
it("accepts scoped view models without recalculating grades or results", () => { expect(checkedHistory(list)).toEqual(list); expect(checkedHistoryDetail(detail, event)).toEqual(detail); });
it("makes missing result and route information explicit", () => { expect(checkedHistoryDetail({ ...detail, results: null, routes: null }, event).results).toBeNull(); expect(checkedHistoryDetail({ ...detail, results: [] }, event).results).toEqual([]); });
it.each([
  { ...list, competitions: [{ ...event, gymId: "other" }] },
  { ...list, competitions: [event, event] },
  { ...list, gyms: [...list.gyms, ...list.gyms] },
  { ...list, competitions: [{ ...event, date: "2026-02-30" }] },
])("rejects unscoped or ambiguous history lists %#", value => { expect(() => checkedHistory(value)).toThrow(); });
it.each([
  { ...detail, competition: { ...event, competitionId: "other" } },
  { ...detail, competition: { ...event, gymId: "other" } },
  { ...detail, results: [{ ...result, competitionId: "other" }] },
  { ...detail, results: [result, result] },
  { ...detail, routes: [{ ...route, competitionId: "other" }] },
  { ...detail, routes: [{ ...route, statistics: { routeId: "wrong", completionRate: 1, averageAttempts: 1, flashRate: 1, calculatedAt: "2026-10-01T12:00:00Z" } }] },
  { ...detail, routes: [{ ...route, statistics: { routeId: "route", completionRate: 80, averageAttempts: 1, flashRate: 1, calculatedAt: "2026-10-01T12:00:00Z" } }] },
])("rejects cross-competition or invalid details %#", value => { expect(() => checkedHistoryDetail(value, event)).toThrow(); });
it("gives a retryable explanation without exposing server diagnostics", () => {
  expect(historyProblem(new ApiError(503, "DATABASE_UNAVAILABLE", "private database address"))).toBe("Couldn't load competition history. Please try again.");
});
