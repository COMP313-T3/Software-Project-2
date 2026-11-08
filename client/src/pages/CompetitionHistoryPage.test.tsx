import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CompetitionHistoryPage from "./CompetitionHistoryPage.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { type HistoryCollection, type HistoryDetail, type HistoryGateway } from "../lib/competitionHistory.ts";
let role = "GYM_ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({ useSession: () => ({ user: { userId: "actor", role, email: "sample@example.com" } }) }));
const id = "507f1f77bcf86cd799439011", otherId = "507f1f77bcf86cd799439012";
const event = { competitionId: id, gymId: "gym", name: "Autumn Open", date: "2026-10-01", location: "Toronto" };
const second = { ...event, competitionId: otherId, gymId: "gym2", name: "Summer Series", date: "2026-08-01", location: "Ottawa" };
const scope: HistoryCollection = { gyms: [{ gymId: "gym", name: "North Gym" }, { gymId: "gym2", name: "River Gym" }], competitions: [event, second] };
const route = { competitionId: id, routeId: "route", routeNumber: "1", name: "Silver Slab", grade: "V3", statistics: { routeId: "route", completionRate: 2 / 3, averageAttempts: 7 / 3, flashRate: 1 / 3, calculatedAt: "2026-10-01T18:00:00Z" } };
const result = { resultId: "result", competitionId: id, routeId: "route", climberName: "Jamie Sample", divisionName: "Open", attempts: 1, sends: 1 as const, flash: true, officialScore: 100 };
const detail: HistoryDetail = { competition: event, results: [result], routes: [route, { ...route, routeId: "empty", routeNumber: "2", name: "Quiet Corner", statistics: null }] };
let gateway: HistoryGateway;
beforeEach(() => { role = "GYM_ADMIN"; gateway = { list: vi.fn().mockResolvedValue(scope), get: vi.fn().mockResolvedValue(detail) }; });
afterEach(cleanup);
function open(url = "/gym-admin/history", api = gateway) { return render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/gym-admin/history" element={<CompetitionHistoryPage gateway={api} />} /><Route path="/gym-admin/history/:competitionId" element={<CompetitionHistoryPage gateway={api} />} /></Routes></MemoryRouter>); }
async function ready() { return screen.findByRole("list", { name: "Previous competitions" }); }
it.each(["ADMIN", "CLIMBER", "VISITOR"])("does not read private history for %s", denied => { role = denied; open(); expect(screen.getByText("Gym administrator access required")).toBeTruthy(); expect(gateway.list).not.toHaveBeenCalled(); });
it("shows backend-provided past events and their actual gyms and calendar dates", async () => {
  open(); const list = await ready(); expect(within(list).getByText("Oct 1, 2026")).toBeTruthy(); expect(within(list).getByText("North Gym · Toronto")).toBeTruthy(); expect(screen.getByText("2 past competitions")).toBeTruthy(); expect(gateway.get).not.toHaveBeenCalled();
  expect(document.title).toBe("Competition history | TopSend");
});
it("filters by an assigned gym and opens its read-only historical details", async () => {
  open(); await ready(); fireEvent.change(screen.getByLabelText("Gym"), { target: { value: "gym" } }); expect(screen.queryByRole("heading", { name: "Summer Series" })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "View history for Autumn Open" }));
  await screen.findByRole("table"); expect(gateway.get).toHaveBeenCalledWith(id, expect.any(AbortSignal));
  expect(screen.getByRole("link", { name: "Back to competition history" }).getAttribute("href")).toBe("/gym-admin/history?gymId=gym");
  expect(screen.getByText("Saved results and route statistics · Read only")).toBeTruthy(); expect(screen.queryByRole("button", { name: /save|edit|delete/i })).toBeNull();
});
it("does not silently replace an unavailable gym with all gyms", async () => { open("/gym-admin/history?gymId=foreign"); await screen.findByRole("heading", { name: "Gym unavailable" }); expect(screen.queryByRole("list", { name: "Previous competitions" })).toBeNull(); });
it("handles an empty historical event collection", async () => { vi.mocked(gateway.list).mockResolvedValue({ ...scope, competitions: [] }); open(); await screen.findByText("No previous competitions"); });
it("shows saved scores and the selected route's statistics without deriving new rankings", async () => {
  open(`/gym-admin/history/${id}`); const table = await screen.findByRole("table"); expect(within(table).getByText("Jamie Sample")).toBeTruthy(); expect(within(table).getByText("100")).toBeTruthy();
  expect(document.title).toBe("Historical results | TopSend");
  expect(screen.getByText("66.7%")).toBeTruthy(); expect(screen.getByText("33.3%")).toBeTruthy(); expect(screen.getByText("2.33")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Boulder problem"), { target: { value: "empty" } }); await screen.findByText(/No official result data is available for this route/); expect(screen.queryByText("66.7%")).toBeNull();
});
it("preserves real zero rates and keeps result and statistics availability independent", async () => {
  vi.mocked(gateway.get).mockResolvedValue({ ...detail, results: null, routes: [{ ...route, statistics: { ...route.statistics, completionRate: 0, flashRate: 0 } }] });
  open(`/gym-admin/history/${id}`); await screen.findByText("Results unavailable"); expect(screen.getAllByText("0%")).toHaveLength(2); expect(screen.getByText("2.33")).toBeTruthy();
});
it("keeps saved results readable when route metadata is missing", async () => {
  vi.mocked(gateway.get).mockResolvedValue({ ...detail, routes: null }); open(`/gym-admin/history/${id}`); const table = await screen.findByRole("table"); expect(within(table).getByText("100")).toBeTruthy(); expect(within(table).getByText("Route information unavailable")).toBeTruthy();
});
it("distinguishes an empty result list from unavailable records", async () => {
  vi.mocked(gateway.get).mockResolvedValue({ ...detail, results: [], routes: [] }); open(`/gym-admin/history/${id}`); await screen.findByText("No saved results"); expect(screen.getByText("No saved boulder problems")).toBeTruthy();
});
it("refuses a competition outside the authenticated history collection before loading its details", async () => {
  open("/gym-admin/history/507f1f77bcf86cd799439099"); await screen.findByRole("alert"); expect(gateway.get).not.toHaveBeenCalled(); expect(screen.queryByText("Jamie Sample")).toBeNull();
});
it("rejects details for a different competition or gym instead of displaying them", async () => {
  vi.mocked(gateway.get).mockResolvedValue({ ...detail, competition: second }); open(`/gym-admin/history/${id}`); await screen.findByRole("alert"); expect(screen.queryByRole("table")).toBeNull();
});
it("handles failure and retry without exposing server diagnostics", async () => {
  vi.mocked(gateway.list).mockRejectedValueOnce(new ApiError(500, "INTERNAL", "database password")); open(); await screen.findByRole("alert"); expect(screen.queryByText("database password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
});
it("removes stale results during refresh and handles results that are no longer available", async () => {
  open(`/gym-admin/history/${id}`); await screen.findByRole("table"); vi.mocked(gateway.get).mockResolvedValue({ ...detail, results: null }); fireEvent.click(screen.getByRole("button", { name: "Refresh history" })); expect(screen.queryByRole("table")).toBeNull(); await screen.findByText("Results unavailable");
});
it("aborts a late detail request when leaving the page", async () => {
  let finish!: (value: HistoryDetail) => void; vi.mocked(gateway.get).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const mounted = open(`/gym-admin/history/${id}`); await act(async () => {}); const signal = vi.mocked(gateway.get).mock.calls[0][1]; mounted.unmount(); await act(async () => finish(detail)); expect(signal.aborted).toBe(true);
});
it("never uses sample competitions as a fallback for an unavailable API", async () => { vi.mocked(gateway.list).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "private details")); open(); await screen.findByRole("alert"); expect(screen.queryByText("Autumn Open")).toBeNull(); });
it("refuses malformed links without making any request", async () => { open("/gym-admin/history/invalid"); await screen.findByText("Invalid competition link"); expect(gateway.list).not.toHaveBeenCalled(); });
it("paginates the history list and does not lose the selected gym on navigation", async () => {
  vi.mocked(gateway.list).mockResolvedValue({ ...scope, competitions: Array.from({ length: 11 }, (_, i) => ({ ...event, competitionId: `event-${i}`, name: `Event ${i}` })) });
  open("/gym-admin/history?gymId=gym"); await ready(); expect(screen.getAllByRole("link", { name: /View history for/ })).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Next" })); expect(screen.getByRole("link", { name: "View history for Event 10" }).getAttribute("href")).toContain("gymId=gym&page=2");
  expect(screen.getAllByRole("link", { name: /View history for/ })).toHaveLength(1);
});
it("requests the next results page and removes old rows while it loads", async () => {
  vi.mocked(gateway.get).mockResolvedValueOnce({ ...detail, resultsPage: { page: 1, limit: 20, total: 21 } }).mockResolvedValueOnce({ ...detail, results: [{ ...result, resultId: "next", climberName: "Next Climber" }], resultsPage: { page: 2, limit: 20, total: 21 } });
  open(`/gym-admin/history/${id}?gymId=gym&page=2`); await screen.findByRole("table"); fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText("Jamie Sample")).toBeNull(); await screen.findByText("Next Climber");
  expect(gateway.get).toHaveBeenLastCalledWith(id, expect.any(AbortSignal), 2);
  expect(screen.getByRole("link", { name: "Back to competition history" }).getAttribute("href")).toBe("/gym-admin/history?gymId=gym&page=2");
});
it("loads only selected-route statistics and ignores a delayed previous response", async () => {
  let finish!: (value: typeof route.statistics | null) => void;
  gateway.statistics = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(null);
  open(`/gym-admin/history/${id}`); await screen.findByRole("table"); const signal = vi.mocked(gateway.statistics).mock.calls[0][2];
  expect(gateway.statistics).toHaveBeenCalledTimes(1); fireEvent.change(screen.getByLabelText("Boulder problem"), { target: { value: "empty" } });
  await screen.findByText(/No official result data is available/); await act(async () => finish(route.statistics));
  expect(signal.aborted).toBe(true); expect(screen.queryByText("66.7%")).toBeNull(); expect(screen.getByRole("table")).toBeTruthy();
});
it("retries a statistics failure without losing saved results", async () => {
  gateway.statistics = vi.fn().mockRejectedValueOnce(new Error("internal diagnostics")).mockResolvedValueOnce(route.statistics);
  open(`/gym-admin/history/${id}`); await screen.findByRole("button", { name: "Retry statistics" });
  expect(screen.getByText("Jamie Sample")).toBeTruthy(); expect(screen.queryByText("internal diagnostics")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry statistics" })); await screen.findByText("66.7%");
});
it("shows actual draft and cancelled statuses without claiming those events completed", async () => {
  vi.mocked(gateway.list).mockResolvedValue({ ...scope, competitions: [{ ...event, status: "DRAFT" }, { ...second, status: "CANCELLED" }] });
  open(); await ready(); expect(screen.getByText("Draft")).toBeTruthy(); expect(screen.getByText("Cancelled")).toBeTruthy(); expect(screen.queryByText(/completed competition/i)).toBeNull();
});
it("keeps the selected gym when returning from history to the dashboard", async () => {
  open("/gym-admin/history?gymId=gym&page=2"); await ready();
  expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe("/dashboard?gymId=gym");
});
it("explains a missing statistics route without claiming all historical results are unavailable", async () => {
  gateway.statistics = vi.fn().mockRejectedValue(new ApiError(404, "ROUTE_NOT_FOUND", "Route missing"));
  open(`/gym-admin/history/${id}`); await screen.findByRole("button", { name: "Retry statistics" });
  expect(screen.getByText("This competition or route is no longer available.")).toBeTruthy();
  expect(screen.getByRole("table")).toBeTruthy();
});
