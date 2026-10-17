import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { fetchGymAdminDashboard, getManagedCompetition, listManagedCompetitions, updateManagedCompetition, type GymAdminSummary, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { listCompetitionRoutes } from "../lib/routesApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/gymAdminApi.ts", () => ({ fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), getManagedCompetition: vi.fn(), createManagedCompetition: vi.fn(), updateManagedCompetition: vi.fn() }));
vi.mock("../lib/routesApi.ts", () => ({ listCompetitionRoutes: vi.fn(), createCompetitionRoute: vi.fn(), getCompetitionRoute: vi.fn(), updateCompetitionRoute: vi.fn() }));
const event: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "North Gym" },
  name: "Autumn Bouldering", date: "2026-10-10", location: "Toronto", status: "PUBLISHED", registrationStatus: "OPEN", capacity: 80,
  description: "Local climbing competition", registeredClimberCount: 12, tools: [{ key: "details", label: "Competition details", story: "US-012" }, { key: "routes", label: "Boulder problems", story: "US-016" }],
};
const second = { ...event, _id: "507f1f77bcf86cd799439013", name: "Winter Bouldering" };
const summary: GymAdminSummary = {
  gyms: [{ _id: event.gymId, name: "North Gym", location: "Toronto" }, { _id: "507f1f77bcf86cd799439014", name: "South Gym", location: "Ottawa" }],
  counts: { upcoming: 21, past: 3, drafts: 2 }, upcoming: [event],
};
function renderPage(path = "/dashboard") { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
function loggedIn(role: "GYM_ADMIN" | "ADMIN" | "CLIMBER" = "GYM_ADMIN") {
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role, session: { expiresIn: 3600, limitReached: false } });
}
beforeEach(() => {
  vi.mocked(fetchGymAdminDashboard).mockReset().mockResolvedValue(summary);
  vi.mocked(listManagedCompetitions).mockReset().mockResolvedValue({ competitions: [event, second], total: 21, page: 1, limit: 20 });
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(event);
  vi.mocked(updateManagedCompetition).mockReset().mockResolvedValue(event);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
  loggedIn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-011 #42/#43 gym administrator dashboard", () => {
  it("opens the boulder problems list for the selected event and preserves return filters", async () => {
    vi.mocked(listCompetitionRoutes).mockResolvedValue({ routes: [], total: 0 });
    const search = `?period=past&gymId=${event.gymId}&page=2`;
    renderPage(`/gym-admin/competitions/${event._id}${search}`);
    const link = await screen.findByRole("link", { name: /Boulder problems/ });
    expect(link.getAttribute("href")).toBe(`/gym-admin/competitions/${event._id}/routes${search}`);
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: "Routes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Back to competition" }));
    expect(await screen.findByRole("region", { name: "Selected competition" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to competitions" }).getAttribute("href")).toBe(`/dashboard${search}#competitions`);
  });
  it("links to the selected competition's scoring settings", async () => {
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...event, tools: [{ key: "scoring", label: "Scoring format", story: "US-018" }] });
    renderPage(`/gym-admin/competitions/${event._id}`);
    const link = await screen.findByRole("link", { name: /Scoring format/ });
    expect(link.getAttribute("href")).toBe(`/gym-admin/competitions/${event._id}/scoring`);
    expect(screen.queryByText("Not available yet")).toBeNull();
  });
  it("opens the divisions workspace from the selected competition and keeps return filters", async () => {
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...event, tools: [{ key: "divisions", label: "Divisions and climbers", story: "US-014" }] });
    const search = "?period=past&gymId=" + event.gymId + "&page=2";
    renderPage("/gym-admin/competitions/" + event._id + search);
    const link = await screen.findByRole("link", { name: /Divisions and climbers/ });
    expect(link.getAttribute("href")).toBe("/gym-admin/competitions/" + event._id + "/divisions" + search);
  });
  it("opens the US-012 creation form with an authorized gym filter and keeps return filters", async () => {
    renderPage("/dashboard?period=past&gymId=" + event.gymId + "&page=2");
    const links = await screen.findAllByRole("link", { name: "Create competition" });
    fireEvent.click(links[0]);
    await screen.findByRole("form", { name: "Competition information" });
    expect((screen.getByLabelText("Competition gym") as HTMLSelectElement).value).toBe(event.gymId);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/dashboard?period=past&gymId=" + event.gymId + "&page=2");
    expect(getManagedCompetition).not.toHaveBeenCalled();
  });
  it("preserves URL period, gym and page through selection and return", async () => {
    vi.mocked(listManagedCompetitions).mockResolvedValue({ competitions: [event], total: 41, page: 2, limit: 20 });
    renderPage(`/dashboard?period=past&gymId=${event.gymId}&page=2`);
    const link = await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    expect(link.getAttribute("href")).toBe(`/gym-admin/competitions/${event._id}?period=past&gymId=${event.gymId}&page=2`);
    fireEvent.click(link);
    await screen.findByRole("region", { name: "Selected competition" });
    fireEvent.click(screen.getByRole("link", { name: "Back to competitions" }));
    await screen.findByRole("region", { name: "Past competitions" });
    expect((screen.getByLabelText("Period") as HTMLSelectElement).value).toBe("past");
    expect((screen.getByLabelText("Gym") as HTMLSelectElement).value).toBe(event.gymId);
    await waitFor(() => expect(listManagedCompetitions).toHaveBeenLastCalledWith({period: "past", gymId: event.gymId, page: 2}, expect.any(AbortSignal)));
  });
  it("scrolls competition navigation to the list and marks the current section", async () => {
    const targets: string[] = [];
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: function(this: Element) { targets.push(this.id); } });
    try {
      renderPage();
      await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
      fireEvent.click(screen.getByRole("link", { name: "Competitions" }));
      await waitFor(() => expect(targets).toContain("competitions"));
      expect(screen.getByRole("link", { name: "Competitions" }).getAttribute("aria-current")).toBe("location");
      fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
      expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("navigates to a separate details page and returns to the dashboard", async () => {
    const scroll = vi.fn();
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      renderPage();
      fireEvent.click(await screen.findByRole("link", { name: "View details for Autumn Bouldering" }));
      await screen.findByRole("region", { name: "Selected competition" });
      await waitFor(() => expect(scroll).toHaveBeenCalled());
      expect(await screen.findByRole("heading", { level: 1, name: event.name })).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Upcoming competitions" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Competition overview" })).toBeNull();
      fireEvent.click(screen.getByRole("link", { name: "Back to competitions" }));
      expect(await screen.findByRole("heading", { level: 1, name: "Gym admin dashboard" })).toBeTruthy();
      expect(await screen.findByRole("link", { name: "View details for Autumn Bouldering" })).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("loads assigned gyms, counts and upcoming competitions on the role's dashboard", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Gym admin dashboard" })).toBeTruthy();
    const overview = screen.getByRole("region", { name: "Competition overview" });
    expect(await within(overview).findByText("21")).toBeTruthy();
    expect(within(overview).getByText("South Gym")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "View details for Autumn Bouldering" })).toBeTruthy();
    expect(document.title).toBe("Gym Admin Dashboard | TopSend");
    expect(listManagedCompetitions).toHaveBeenCalledWith({ period: "upcoming", gymId: "", page: 1 }, expect.any(AbortSignal));
  });
  it("shows unknown counts as placeholders while loading", async () => {
    vi.mocked(fetchGymAdminDashboard).mockImplementation(() => new Promise(() => {}));
    vi.mocked(listManagedCompetitions).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(await screen.findByText("Loading gym overview…")).toBeTruthy();
    expect(screen.getAllByText("Loading")).toHaveLength(3);
    expect(screen.queryByText("0")).toBeNull();
  });
  it("supports pagination and resets to page one for period and gym changes", async () => {
    renderPage(); await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(listManagedCompetitions).toHaveBeenLastCalledWith({ period: "upcoming", gymId: "", page: 2 }, expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "past" } });
    await waitFor(() => expect(listManagedCompetitions).toHaveBeenLastCalledWith({ period: "past", gymId: "", page: 1 }, expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("Gym"), { target: { value: event.gymId } });
    await waitFor(() => expect(listManagedCompetitions).toHaveBeenLastCalledWith({ period: "past", gymId: event.gymId, page: 1 }, expect.any(AbortSignal)));
  });
  it("shows an empty state and disables no-result pagination", async () => {
    vi.mocked(listManagedCompetitions).mockResolvedValue({ competitions: [], total: 0, page: 1, limit: 20 });
    renderPage();
    expect(await screen.findByText("No upcoming competitions for the selected gyms.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
  it("clears old competition rows during refresh and shows fresh results", async () => {
    renderPage(); await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    let resolve!: (value: { competitions: typeof event[]; total: number; page: number; limit: number }) => void;
    vi.mocked(listManagedCompetitions).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    await screen.findByText("Loading competitions…");
    expect(screen.queryByRole("link", { name: "View details for Autumn Bouldering" })).toBeNull();
    await act(async () => resolve({ competitions: [second], total: 1, page: 1, limit: 20 }));
    expect(await screen.findByRole("link", { name: "View details for Winter Bouldering" })).toBeTruthy();
  });
  it("shows a readable list error, hides technical exceptions and supports retry", async () => {
    vi.mocked(listManagedCompetitions).mockRejectedValueOnce(new Error("internal database secret"));
    renderPage();
    expect(await screen.findByText("Couldn't load competitions. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/internal database secret/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry competitions" }));
    expect(await screen.findByRole("link", { name: "View details for Autumn Bouldering" })).toBeTruthy();
  });
  it("opens a selected competition with current details and only working tool links", async () => {
    renderPage(); await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    fireEvent.click(screen.getByRole("link", { name: "View details for Autumn Bouldering" }));
    const panel = await screen.findByRole("region", { name: "Selected competition" });
    expect((within(panel).getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe("Local climbing competition");
    expect(getManagedCompetition).toHaveBeenCalledWith(event._id, expect.any(AbortSignal));
    expect(within(panel).queryByRole("link", { name: "Competition details" })).toBeNull();
    expect(within(panel).getByRole("heading", { name: "Competition information" })).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Boulder problems/ }).getAttribute("href"))
      .toBe("/gym-admin/competitions/" + event._id + "/routes");
    expect((within(panel).getByLabelText("Date") as HTMLInputElement).value).toBe(event.date);
    expect(within(panel).getByText("12")).toBeTruthy();
  });
  it("edits competition information, capacity, and registration status", async () => {
    renderPage(`/gym-admin/competitions/${event._id}`);
    await screen.findByRole("region", { name: "Selected competition" });
    await waitFor(() => expect((screen.getByLabelText("Competition name") as HTMLInputElement).value).toBe(event.name));
    fireEvent.change(screen.getByLabelText("Competition name"), { target: { value: "Updated Bouldering" } });
    fireEvent.change(screen.getByLabelText("Maximum participants"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Registration status"), { target: { value: "CLOSED" } });
    fireEvent.click(screen.getByRole("button", { name: "Save competition details" }));
    await waitFor(() => expect(updateManagedCompetition).toHaveBeenCalledWith(event._id, expect.objectContaining({
      name: "Updated Bouldering",
      capacity: 100,
      registrationStatus: "CLOSED",
    }), expect.any(AbortSignal)));
    expect(await screen.findByText("Competition details saved.")).toBeTruthy();
  });
  it("supports a direct competition URL and shows no private details for a 404", async () => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."));
    renderPage(`/gym-admin/competitions/${event._id}`);
    const panel = await screen.findByRole("region", { name: "Selected competition" });
    expect(await within(panel).findByText("Competition not found.")).toBeTruthy();
    expect(within(panel).queryByText("Local climbing competition")).toBeNull();
    expect(within(panel).queryByRole("link", { name: "Competition details" })).toBeNull();
  });
  it("hides previously loaded private data when assignment is revoked", async () => {
    renderPage(); await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    vi.mocked(listManagedCompetitions).mockRejectedValue(new ApiError(403, "NO_ASSIGNED_GYM", "Contact a System Administrator."));
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    expect(await screen.findByText("Contact a System Administrator.")).toBeTruthy();
    expect(screen.queryByText("North Gym")).toBeNull();
    expect(screen.queryByRole("link", { name: "View details for Autumn Bouldering" })).toBeNull();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks direct competition access for %s before API calls", async role => {
    loggedIn(role); renderPage(`/gym-admin/competitions/${event._id}`);
    expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(fetchGymAdminDashboard).not.toHaveBeenCalled(); expect(listManagedCompetitions).not.toHaveBeenCalled(); expect(getManagedCompetition).not.toHaveBeenCalled();
  });
  it("redirects a visitor before loading any private competition data", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: false });
    renderPage(`/gym-admin/competitions/${event._id}`);
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(fetchGymAdminDashboard).not.toHaveBeenCalled(); expect(getManagedCompetition).not.toHaveBeenCalled();
  });
  it("logs out through the shared session and clears the dashboard", async () => {
    renderPage(); await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(sessionApi.logOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "View details for Autumn Bouldering" })).toBeNull();
  });
  it("aborts dashboard and list reads when leaving the page", async () => {
    const view = renderPage(); await screen.findByRole("link", { name: "View details for Autumn Bouldering" });
    const summarySignal = vi.mocked(fetchGymAdminDashboard).mock.calls[0][0];
    const listSignal = vi.mocked(listManagedCompetitions).mock.calls[0][1];
    view.unmount(); expect(summarySignal?.aborted).toBe(true); expect(listSignal?.aborted).toBe(true);
  });
});
