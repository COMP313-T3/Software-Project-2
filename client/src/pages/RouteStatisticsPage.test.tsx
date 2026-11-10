import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RouteStatisticsPage from "./RouteStatisticsPage.tsx";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { listCompetitionRoutes } from "../lib/routesApi.ts";
import { getRouteStatistics, type StatisticsSnapshot } from "../lib/routeStatisticsApi.ts";
import { ApiError } from "../lib/apiClient.ts";
let role = "GYM_ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({ useSession: () => ({ user: { userId: "actor", role, email: "sample@example.com" } }) }));
vi.mock("../lib/gymAdminApi.ts", () => ({ getManagedCompetition: vi.fn() }));
vi.mock("../lib/routesApi.ts", () => ({ listCompetitionRoutes: vi.fn() }));
vi.mock("../lib/routeAssistantApi.ts", async original => ({ ...await original<typeof import("../lib/routeAssistantApi.ts")>(), getRouteAssistant: vi.fn(() => new Promise(() => {})) }));
vi.mock("../lib/routeStatisticsApi.ts", async original => ({ ...await original<typeof import("../lib/routeStatisticsApi.ts")>(), getRouteStatistics: vi.fn() }));
const id = "507f1f77bcf86cd799439011", route1 = "507f1f77bcf86cd799439021", route2 = "507f1f77bcf86cd799439022";
const competition: ManagedCompetitionDetails = { _id: id, gymId: "gym", gym: { _id: "gym", name: "Sample Gym" }, name: "Autumn Open", date: "2026-11-06", location: "Toronto", status: "PUBLISHED", registrationStatus: "CLOSED", capacity: 80, tools: [] };
const routes = [{ routeId: route1, competitionId: id, routeNumber: "1", name: "Silver Slab", grade: "V3", official: true }, { routeId: route2, competitionId: id, routeNumber: "2", name: "Purple Roof", grade: "V5", official: true }];
const snapshot: StatisticsSnapshot = { competitionId: id, statistics: { routeId: route1, completionRate: 2 / 3, averageAttempts: 7 / 3, flashRate: 1 / 3, calculatedAt: "2026-11-06T18:00:00Z" } };
beforeEach(() => {
  role = "GYM_ADMIN";
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(listCompetitionRoutes).mockReset().mockResolvedValue({ routes, total: 2 });
  vi.mocked(getRouteStatistics).mockReset().mockResolvedValue(snapshot);
});
afterEach(cleanup);
function open(search = "", competitionId = id) { return render(<MemoryRouter initialEntries={[`/gym-admin/competitions/${competitionId}/statistics${search}`]}><Routes><Route path="/gym-admin/competitions/:competitionId/statistics" element={<RouteStatisticsPage />} /></Routes></MemoryRouter>); }
async function ready() { await screen.findByRole("meter", { name: "Completion rate" }); }
it.each(["ADMIN", "CLIMBER", "VISITOR"])("does not load private data for %s", denied => { role = denied; open(); expect(screen.getByText("Gym administrator access required")).toBeTruthy(); expect(getManagedCompetition).not.toHaveBeenCalled(); expect(getRouteStatistics).not.toHaveBeenCalled(); });
it("AC-022 has the AI Route Assistant's chatbot for this competition's route statistics", async () => {
  open(); await ready();
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
  const chat = within(screen.getByRole("dialog", { name: "AI Route Assistant" }));
  expect(chat.getByText("Autumn Open, Route statistics")).toBeTruthy();
  expect(chat.getByText(/Ask how the problems performed\./)).toBeTruthy();
});
it("AC-022 has no chatbot when the competition couldn't be loaded", async () => {
  vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."));
  open(); await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
});
it("shows scoped route context, server fractions and the official grade without edits", async () => {
  open("?period=past&page=2"); await ready();
  expect(screen.getByRole("heading", { name: "Autumn Open" })).toBeTruthy(); expect(screen.getByText("Sample Gym")).toBeTruthy();
  expect(screen.getByText("66.7%", { selector: "p" })).toBeTruthy(); expect(screen.getByText("33.3%", { selector: "p" })).toBeTruthy(); expect(screen.getByText("2.33")).toBeTruthy();
  expect(screen.getByRole("meter", { name: "Completion rate" }).getAttribute("value")).toBe(String(2 / 3));
  expect(screen.getByText("V3")).toBeTruthy(); expect(screen.getByRole("link", { name: "View route details" }).getAttribute("href")).toBe(`/gym-admin/competitions/${id}/routes/${route1}?period=past&page=2`);
  expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  expect(getRouteStatistics).toHaveBeenCalledExactlyOnceWith(id, route1, expect.any(AbortSignal));
});
it("selects a linked route and preserves filters when returning to the competition", async () => {
  vi.mocked(getRouteStatistics).mockResolvedValue({ ...snapshot, statistics: { ...snapshot.statistics!, routeId: route2 } }); open(`?routeId=${route2}&page=2`); await ready();
  expect(screen.getByRole("combobox").getAttribute("id")).toBe("statistics-route");
  expect(getRouteStatistics).toHaveBeenCalledWith(id, route2, expect.any(AbortSignal));
  expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toBe(`/gym-admin/competitions/${id}?page=2`);
});
it("clears old numbers while switching routes and ignores a late previous response", async () => {
  let finish!: (value: StatisticsSnapshot) => void;
  vi.mocked(getRouteStatistics).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ competitionId: id, statistics: null });
  open(); await screen.findByRole("combobox"); await waitFor(() => expect(getRouteStatistics).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(getRouteStatistics).mock.calls[0][2]!;
  fireEvent.change(screen.getByRole("combobox"), { target: { value: route2 } }); await screen.findByText("No official result data yet");
  await act(async () => finish(snapshot)); expect(signal.aborted).toBe(true); expect(screen.queryByText("66.7%")).toBeNull(); expect(screen.getByRole("heading", { name: "Route 2 · Purple Roof" })).toBeTruthy();
});
it("treats zero performance as real data rather than an empty state", async () => {
  vi.mocked(getRouteStatistics).mockResolvedValue({ ...snapshot, statistics: { ...snapshot.statistics!, completionRate: 0, flashRate: 0 } }); open(); await ready();
  expect(screen.getAllByText("0%", { selector: "p" })).toHaveLength(2); expect(screen.queryByText("No official result data yet")).toBeNull();
});
it("refreshes statistics without leaving the selected route", async () => {
  vi.mocked(getRouteStatistics).mockResolvedValue({ ...snapshot, statistics: { ...snapshot.statistics!, routeId: route2 } });
  open(`?routeId=${route2}&page=2`); await ready();
  vi.mocked(getRouteStatistics).mockResolvedValue({ competitionId: id, statistics: null });
  fireEvent.click(screen.getByRole("button", { name: "Refresh statistics" }));
  expect(screen.queryByRole("meter", { name: "Completion rate" })).toBeNull();
  await screen.findByText("No official result data yet"); expect(getRouteStatistics).toHaveBeenCalledTimes(2);
  expect(getRouteStatistics).toHaveBeenLastCalledWith(id, route2, expect.any(AbortSignal));
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(route2);
  expect(getManagedCompetition).toHaveBeenCalledTimes(2);
});
it("handles no routes without requesting statistics", async () => {
  vi.mocked(listCompetitionRoutes).mockResolvedValue({ routes: [], total: 0 }); open(); await screen.findByText("No boulder problems yet"); expect(getRouteStatistics).not.toHaveBeenCalled();
});
it("never substitutes another route for an unavailable deep link", async () => {
  open("?routeId=missing"); await screen.findByText("Route unavailable"); expect(getRouteStatistics).not.toHaveBeenCalled();
});
it("rejects a route list from another competition", async () => {
  vi.mocked(listCompetitionRoutes).mockResolvedValue({ routes: [{ ...routes[0], competitionId: "other" }], total: 1 }); open(); await screen.findByRole("alert"); expect(getRouteStatistics).not.toHaveBeenCalled();
});
it("shows a safe scoped error then recovers on retry", async () => {
  vi.mocked(getRouteStatistics).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "private details")); open(); await screen.findByText("You don't have access to statistics for this competition.");
  expect(screen.queryByText("private details")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
});
it("handles route-list failure and reloads both context and routes", async () => {
  vi.mocked(listCompetitionRoutes).mockRejectedValueOnce(new Error("database URI")); open(); await screen.findByRole("alert"); expect(getRouteStatistics).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready(); expect(getManagedCompetition).toHaveBeenCalledTimes(2);
});
it("refuses a malformed competition link and offers a valid return to the competition list", async () => {
  open("?period=past&page=2", "invalid"); await screen.findByRole("alert"); expect(getManagedCompetition).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Back to competitions" }).getAttribute("href")).toBe("/dashboard?period=past&page=2#competitions");
});
it("aborts pending reads when leaving the page", async () => {
  vi.mocked(getRouteStatistics).mockReturnValue(new Promise(() => {})); const mounted = open(); await waitFor(() => expect(getRouteStatistics).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(getRouteStatistics).mock.calls[0][2]!; mounted.unmount(); expect(signal.aborted).toBe(true);
});
