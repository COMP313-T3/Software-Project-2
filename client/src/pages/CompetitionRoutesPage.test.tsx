import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { getCompetitionRoute, listCompetitionRoutes, type CompetitionRouteList, type ManagedRoute } from "../lib/routesApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/routesApi.ts", () => ({ listCompetitionRoutes: vi.fn(), createCompetitionRoute: vi.fn(), getCompetitionRoute: vi.fn(), updateCompetitionRoute: vi.fn() }));
vi.mock("../lib/gymAdminApi.ts", () => ({ fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), getManagedCompetition: vi.fn(), createManagedCompetition: vi.fn(), updateManagedCompetition: vi.fn() }));
const competition: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" },
  name: "Autumn Open", date: "2026-11-14", location: "Toronto", status: "PUBLISHED", registrationStatus: "OPEN", capacity: 80,
  tools: [{ key: "routes", label: "Boulder problems", story: "US-016" }],
};
const routes: ManagedRoute[] = [
  { routeId: "507f1f77bcf86cd799439021", competitionId: competition._id, routeNumber: "2", name: "Dawn Patrol", grade: "V1", pointValue: 100, official: true },
  { routeId: "507f1f77bcf86cd799439022", competitionId: competition._id, routeNumber: "10", name: "Summit Traverse", grade: "V4", official: true },
];
const otherId = "507f1f77bcf86cd799439019";
const path = `/gym-admin/competitions/${competition._id}/routes`;
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(path.replace(competition._id, otherId))}>Select other competition</button>;
}
function renderPage(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function ready() { return screen.findByRole("list", { name: "Routes" }); }
function row(name: string) { return screen.getByRole("heading", { name }).closest("li") as HTMLElement; }
beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(listCompetitionRoutes).mockReset().mockResolvedValue({ routes, total: 2 });
  vi.mocked(getCompetitionRoute).mockReset().mockResolvedValue(routes[0]);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-016 and US-017 boulder problems list", () => {
  it("lists the selected competition's routes in the API's order with their key details", async () => {
    renderPage(); const list = await ready();
    expect(screen.getByRole("heading", { name: "Boulder problems", level: 1 })).toBeTruthy();
    expect(document.title).toBe("Boulder Problems | TopSend");
    expect(screen.getByText("Autumn Open").closest("p")?.textContent).toBe("Autumn Open, Nov 14, 2026 at Brian Test Gym");
    expect(within(list).getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Dawn Patrol", "Summit Traverse"]);
    expect(within(row("Dawn Patrol")).getByText("Route 2")).toBeTruthy(); expect(within(row("Dawn Patrol")).getByText("V1")).toBeTruthy();
    expect(within(row("Dawn Patrol")).getByText("100 points")).toBeTruthy();
    expect(within(row("Summit Traverse")).getByText("No point value")).toBeTruthy();
    expect(screen.getByText("2 routes, by route number")).toBeTruthy();
    expect(listCompetitionRoutes).toHaveBeenCalledWith(competition._id, expect.any(AbortSignal));
  });
  it("opens each route's details and adds routes, keeping the competition filters", async () => {
    const search = `?period=past&gymId=${competition.gymId}&page=2`;
    renderPage(path + search); await ready();
    const link = screen.getByRole("link", { name: "View details for route 2, Dawn Patrol, V1" });
    expect(link.getAttribute("href")).toBe(`${path}/${routes[0].routeId}${search}`);
    expect(screen.getByRole("link", { name: "Add route" }).getAttribute("href")).toBe(`${path}/new${search}`);
    expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toBe(`/gym-admin/competitions/${competition._id}${search}`);
    fireEvent.click(link);
    expect(await screen.findByRole("form", { name: "Edit route details" })).toBeTruthy();
    expect(getCompetitionRoute).toHaveBeenCalledWith(competition._id, routes[0].routeId, expect.any(AbortSignal));
  });
  it("calls a route without a name by its number", async () => {
    const unnamed: ManagedRoute = { routeId: "507f1f77bcf86cd799439023", competitionId: competition._id, routeNumber: "7", grade: "V3", official: true };
    vi.mocked(listCompetitionRoutes).mockResolvedValue({ routes: [unnamed], total: 1 });
    renderPage(); const list = await ready();
    expect(within(list).getByRole("heading", { name: "Route 7" })).toBeTruthy();
    expect(within(list).getAllByText("Route 7")).toHaveLength(1);
    expect(within(list).getByRole("link", { name: "View details for route 7, V3" })).toBeTruthy();
  });
  it("shows an empty state with a way to add the first route", async () => {
    vi.mocked(listCompetitionRoutes).mockResolvedValue({ routes: [], total: 0 });
    renderPage(); expect(await screen.findByText("No routes yet. Add the first boulder problem for this competition.")).toBeTruthy();
    expect(screen.getByText("0 routes, by route number")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add route" })).toBeTruthy();
  });
  it("reads routes only after the competition check passes", async () => {
    const pending = deferred<ManagedCompetitionDetails>(); vi.mocked(getManagedCompetition).mockReturnValue(pending.promise);
    renderPage(); expect(await screen.findByText("Loading boulder problems…")).toBeTruthy();
    expect(listCompetitionRoutes).not.toHaveBeenCalled();
    await act(async () => pending.resolve(competition)); await ready();
  });
  it.each([
    [401, "NOT_AUTHENTICATED", "Log in to continue."],
    [403, "NO_ASSIGNED_GYM", "Your account isn't assigned to an active gym yet. Contact a System Administrator."],
    [404, "COMPETITION_NOT_FOUND", "Competition not found."],
  ])("shows the refusal and no route data when access is refused (%s)", async (status, code, message) => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(status, code, message));
    renderPage(); expect(await screen.findByText(message)).toBeTruthy();
    expect(listCompetitionRoutes).not.toHaveBeenCalled(); expect(screen.queryByRole("link", { name: "Add route" })).toBeNull();
  });
  it("offers a retry after a failure without showing internal details", async () => {
    vi.mocked(listCompetitionRoutes).mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "private database password"));
    renderPage(); expect(await screen.findByText("Couldn't load the boulder problems. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private database/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });
  it("reloads the list with Refresh routes", async () => {
    renderPage(); await ready();
    vi.mocked(listCompetitionRoutes).mockResolvedValueOnce({ routes: [routes[1]], total: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh routes" })); await ready();
    expect(screen.queryByText("Dawn Patrol")).toBeNull(); expect(screen.getByText("1 route, by route number")).toBeTruthy();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s before reading private route data", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other-user", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled(); expect(listCompetitionRoutes).not.toHaveBeenCalled();
  });
  it("requires a login for a Visitor", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(); expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(listCompetitionRoutes).not.toHaveBeenCalled();
  });
  it("ignores a late list from the previously selected competition", async () => {
    const pending = deferred<CompetitionRouteList>();
    vi.mocked(listCompetitionRoutes).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ routes: [{ ...routes[1], competitionId: otherId }], total: 1 });
    vi.mocked(getManagedCompetition).mockResolvedValueOnce(competition).mockResolvedValueOnce({ ...competition, _id: otherId, name: "Second event" });
    renderPage(); await waitFor(() => expect(listCompetitionRoutes).toHaveBeenCalledOnce());
    const signal = vi.mocked(listCompetitionRoutes).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Select other competition" })); await ready();
    await act(async () => pending.resolve({ routes, total: 2 }));
    expect(signal?.aborted).toBe(true); expect(screen.queryByText("Dawn Patrol")).toBeNull(); expect(screen.getByText("Second event")).toBeTruthy();
  });
});

describe("US-016 malformed links", () => {
  it("explains a malformed competition link without offering a retry", async () => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", { competitionId: "Invalid competition id." }));
    renderPage("/gym-admin/competitions/not-a-competition/routes");
    expect(await screen.findByText("This competition link isn't valid.")).toBeTruthy();
    expect(screen.queryByText("Check the fields and try again.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
