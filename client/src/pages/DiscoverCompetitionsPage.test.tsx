import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { discoverCompetitions, EMPTY_DISCOVERY_FILTERS, getCompetitionMap, getDiscoveredEvent, getDiscoveryOptions, type DiscoveredEventDetails, type DiscoveryResults } from "../lib/discoveryApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/discoveryApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/discoveryApi.ts")>(), discoverCompetitions: vi.fn(), getCompetitionMap: vi.fn(), getDiscoveryOptions: vi.fn(), getDiscoveredEvent: vi.fn() }));
const gymId = "507f1f77bcf86cd799439011";
const event: DiscoveredEventDetails = {
  _id: "507f1f77bcf86cd799439012", name: "Autumn Open", date: "2026-11-14", location: "Toronto", gym: { _id: gymId, name: "Northside Climbing" },
  registrationStatus: "OPEN", capacity: 80, spacesLeft: 0, full: true, coordinates: null, distanceKm: 0,
  description: "An event for the climbing community.", upcoming: true, registrationAvailable: false,
  divisions: [{ _id: "division-1", name: "Open division" }], scoringFormat: { format: "TOPS", label: "Tops and zones" },
  myRegistration: { status: "CONFIRMED", registeredAt: "2026-10-17T12:00:00Z", division: { _id: "division-1", name: "Open division" } },
};
const results: DiscoveryResults = { competitions: [event], total: 1, page: 1, limit: 20 };
const mapResults = { pins: [{ ...event, coordinates: { lat: 43.6532, lng: -79.3832 } }], total: 1, unmapped: 0, truncated: false };
function Position() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output aria-label="Current address">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate("/competitions?q=Ottawa")}>Search Ottawa</button></>;
}
function renderPage(url = "/competitions") { return render(<MemoryRouter initialEntries={[url]}><Position /><App /></MemoryRouter>); }
const ready = () => screen.findByRole("heading", { name: event.name, level: 3 });
function openFilters() { const button = screen.getByRole("button", { name: "Filter" }); if (button.getAttribute("aria-expanded") === "false") fireEvent.click(button); }
function set(field: string, value: string) { if (field !== "Search competitions") openFilters(); fireEvent.change(screen.getByLabelText(field, { exact: true }), { target: { value } }); }
function submit() { fireEvent.submit(screen.getByRole("form", { name: "Search and filter competitions" })); }
beforeEach(() => {
  vi.mocked(discoverCompetitions).mockReset().mockResolvedValue(results);
  vi.mocked(getCompetitionMap).mockReset().mockResolvedValue(mapResults);
  vi.mocked(getDiscoveryOptions).mockReset().mockResolvedValue({ gyms: [{ _id: gymId, name: "Northside Climbing", location: "Toronto", competitionCount: 1 }], registration: [{ value: "any", label: "All upcoming competitions" }, { value: "open", label: "Registration open" }], maxRadiusKm: 200, hasSavedLocation: true });
  vi.mocked(getDiscoveredEvent).mockReset().mockResolvedValue(event);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "climber-id", role: "CLIMBER", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber-id", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US025 Climber discovery", () => {
  it("shows upcoming event data and genuine zero availability and distance", async () => {
    renderPage(); await ready();
    expect(screen.getByText("1 competition found")).toBeTruthy();
    expect(screen.getByText("Full, no spaces left")).toBeTruthy();
    expect(screen.getByText("0 km away")).toBeTruthy();
    expect(screen.getByText("Nov 14, 2026")).toBeTruthy();
    expect(discoverCompetitions).toHaveBeenCalledWith(EMPTY_DISCOVERY_FILTERS, 1, expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "Map view" })).toBeTruthy();
  });
  it("opens the map view with current filters and preserves the list fallback", async () => {
    renderPage("/competitions?q=Autumn");
    await ready();
    fireEvent.click(screen.getByRole("link", { name: "Map view" }));
    await screen.findByText("Google Maps couldn't load. You can still use the competition list.");
    expect(screen.getByLabelText("Current address").textContent).toBe("/competitions?q=Autumn&view=map");
    expect(getCompetitionMap).toHaveBeenCalledWith({ ...EMPTY_DISCOVERY_FILTERS, q: "Autumn" }, expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "Open competition list" }).getAttribute("href")).toBe("/competitions?q=Autumn");
  });
  it("redirects the old dashboard directly to discovery without a success placeholder", async () => {
    renderPage("/dashboard");
    await ready(); expect(screen.getByLabelText("Current address").textContent).toBe("/competitions");
    expect(screen.queryByRole("heading", { name: "Successfully logged in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
  });
  it("returns to the selected event after fresh login with a non-blocking confirmation", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: false });
    vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "climber-id", role: "CLIMBER", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
    const destination = `/competitions/${event._id}?q=Autumn`;
    renderPage(`/login?returnTo=${encodeURIComponent(destination)}`);
    const login = await screen.findByRole("tabpanel");
    fireEvent.change(within(login).getByLabelText("Email", { exact: true }), { target: { value: "climber@example.com" } });
    fireEvent.change(within(login).getByLabelText("Password", { exact: true }), { target: { value: "fixture-password" } });
    fireEvent.click(within(login).getByRole("button", { name: "Log in" }));
    await screen.findByRole("region", { name: "Competition event details" });
    expect(screen.getByLabelText("Current address").textContent).toBe(destination);
    expect(screen.getByText("Successfully logged in").getAttribute("role")).toBe("status");
    expect(screen.queryByRole("dialog", { name: /logged in/i })).toBeNull();
  });
  it("applies the draft once submitted and resets pagination", async () => {
    renderPage("/competitions?page=2"); await ready();
    openFilters();
    await screen.findByRole("option", { name: "Northside Climbing (Toronto)" });
    set("Search competitions", "Autumn"); set("Gym", gymId); set("From date", "2026-11-01"); set("To date", "2026-12-01"); set("Registration", "open"); set("Distance from saved location (km)", "15.5");
    expect(discoverCompetitions).toHaveBeenCalledOnce(); submit();
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ q: "Autumn", gymId, from: "2026-11-01", to: "2026-12-01", registration: "open", radiusKm: "15.5" }, 1, expect.any(AbortSignal)));
    expect(screen.getByLabelText("Current address").textContent).not.toContain("page=");
  });
  it("keeps filters through pagination; clearing filters keeps the search and resets paging", async () => {
    vi.mocked(discoverCompetitions).mockResolvedValueOnce({ ...results, total: 23 }).mockResolvedValueOnce({ ...results, total: 23, page: 2 }).mockResolvedValue(results);
    renderPage("/competitions?q=Autumn&registration=open"); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Autumn", registration: "open" }), 2, expect.any(AbortSignal)));
    await screen.findByText("Page 2 of 2"); openFilters(); fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, q: "Autumn" }, 1, expect.any(AbortSignal)));
    expect(screen.getByLabelText("Current address").textContent).toBe("/competitions?q=Autumn");
  });
  it("allows deleting the keyword and searching again without dropping the chosen gym", async () => {
    renderPage(`/competitions?q=Autumn&gymId=${gymId}`); await ready();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    set("Search competitions", ""); submit();
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, gymId }, 1, expect.any(AbortSignal)));
    expect((screen.getByLabelText("Search competitions") as HTMLInputElement).value).toBe("");
  });
  it("clears the applied keyword on focus while retaining results until the next search", async () => {
    renderPage("/competitions?q=Autumn"); await ready();
    const input = screen.getByLabelText("Search competitions") as HTMLInputElement;
    expect(input.value).toBe("Autumn");
    fireEvent.focus(input); expect(input.value).toBe("");
    expect(discoverCompetitions).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Current address").textContent).toBe("/competitions?q=Autumn");
    expect(screen.getByRole("heading", { name: event.name, level: 3 })).toBeTruthy();
    fireEvent.change(input, { target: { value: "Boulder" } });
    fireEvent.blur(input); fireEvent.focus(input); expect(input.value).toBe("Boulder");
    const toolbar = screen.getByRole("button", { name: "Refresh results" }).parentElement as HTMLElement;
    expect(within(toolbar).getByRole("button", { name: "Filter" })).toBeTruthy();
  });
  it("opens read-only details and restores filters on return", async () => {
    const query = "?q=Autumn&registration=open&page=2";
    renderPage("/competitions" + query); await ready();
    fireEvent.click(screen.getByRole("link", { name: "View event details for Autumn Open" }));
    expect(await screen.findByRole("region", { name: "Competition event details" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to discovery" }).getAttribute("href")).toBe("/competitions" + query);
    fireEvent.click(screen.getByRole("link", { name: "Back to discovery" })); await ready();
    expect((screen.getByLabelText("Search competitions") as HTMLInputElement).value).toBe("Autumn");
  });
  it("applying filters retains the actual search after the input was cleared on focus", async () => {
    renderPage("/competitions?q=Autumn"); await ready();
    fireEvent.focus(screen.getByLabelText("Search competitions"));
    set("Gym", gymId); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, q: "Autumn", gymId }, 1, expect.any(AbortSignal)));
  });
  it("closing filters discards unapplied conditions before the next search", async () => {
    renderPage(); await ready(); set("Gym", gymId);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    set("Search competitions", "Boulder"); submit();
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, q: "Boulder" }, 1, expect.any(AbortSignal)));
  });
  it("validates date order before making a request and focuses the error", async () => {
    renderPage(); await ready(); set("From date", "2026-12-01"); set("To date", "2026-11-01"); submit();
    expect(screen.getByText("Choose an end date on or after the start date.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("To date")); expect(discoverCompetitions).toHaveBeenCalledOnce();
  });
  it.each(["?page=-1", "?page=1.5", "?page=9007199254740992", "?from=2026-02-30", "?registration=forged"])("rejects malformed saved search %s", async query => {
    renderPage("/competitions" + query); expect(await screen.findByText("Check your search filters.")).toBeTruthy();
    expect(discoverCompetitions).not.toHaveBeenCalled();
  });
  it("explains that the distance filter only includes competitions whose gym has a map location", async () => {
    renderPage(); await ready(); openFilters();
    expect(screen.getByText("Uses the location saved with your account. Only competitions whose gym has a map location are included. Leave blank for any distance.")).toBeTruthy();
  });
  it("shows a server field error without clearing the entered filter", async () => {
    vi.mocked(discoverCompetitions).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check filters.", { radiusKm: "Save a location before using distance." }));
    renderPage("/competitions?radiusKm=10");
    expect(await screen.findByText("Save a location before using distance.")).toBeTruthy();
    expect((screen.getByLabelText("Distance from saved location (km)") as HTMLInputElement).value).toBe("10");
  });
  it("allows search when gym choices fail and retries the choices separately", async () => {
    vi.mocked(getDiscoveryOptions).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ gyms: [], registration: [], maxRadiusKm: 200, hasSavedLocation: false });
    renderPage(); await ready();
    openFilters();
    fireEvent.click(await screen.findByRole("button", { name: "Retry filter choices" }));
    await waitFor(() => expect(getDiscoveryOptions).toHaveBeenCalledTimes(2));
    set("Search competitions", "Toronto"); submit();
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Toronto" }), 1, expect.any(AbortSignal)));
  });
  it("opens applied filters through a plain Filter button", async () => {
    renderPage(`/competitions?gymId=${gymId}&registration=open`); await ready();
    const button = screen.getByRole("button", { name: "Filter" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toBe("Filter");
    expect(screen.queryByRole("region", { name: "Competition filters" })).toBeNull();
    fireEvent.click(button); expect(screen.getByRole("region", { name: "Competition filters" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" })); await ready();
    expect(screen.getByRole("button", { name: "Filter" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("offers recovery for empty and out-of-range results", async () => {
    vi.mocked(discoverCompetitions).mockResolvedValueOnce({ competitions: [], total: 1, page: 5, limit: 20 }).mockResolvedValue(results);
    renderPage("/competitions?q=Autumn&page=5");
    fireEvent.click(await screen.findByRole("button", { name: "Back to first page" })); await ready();
    expect(discoverCompetitions).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Autumn" }), 1, expect.any(AbortSignal));
  });
  it("hides internal error details and retries a failed read", async () => {
    vi.mocked(discoverCompetitions).mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "secret database URI")).mockResolvedValue(results);
    renderPage(); fireEvent.click(await screen.findByRole("button", { name: "Try again" })); await ready();
    expect(screen.queryByText("secret database URI")).toBeNull();
  });
  it("clears results and filters after access refusal", async () => {
    vi.mocked(discoverCompetitions).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Climber access required."));
    renderPage(); expect(await screen.findByText("Climber access required.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText(event.name)).toBeNull();
  });
  it.each(["ADMIN", "GYM_ADMIN"] as const)("prevents %s access before requesting events", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "wrong-role", email: "wrong@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); expect(await screen.findByText("Climber access required")).toBeTruthy();
    expect(discoverCompetitions).not.toHaveBeenCalled(); expect(getDiscoveryOptions).not.toHaveBeenCalled();
  });
  it("ignores an old search that completes after the next search", async () => {
    let resolve!: (value: DiscoveryResults) => void;
    vi.mocked(discoverCompetitions).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue({ ...results, competitions: [{ ...event, name: "Ottawa Open" }] });
    renderPage(); await waitFor(() => expect(discoverCompetitions).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Search Ottawa" }));
    expect(await screen.findByRole("heading", { name: "Ottawa Open" })).toBeTruthy();
    await act(async () => resolve(results)); expect(screen.queryByRole("heading", { name: event.name })).toBeNull();
    expect(vi.mocked(discoverCompetitions).mock.calls[0][2]?.aborted).toBe(true);
  });
});

describe("US026 competition list view", () => {
  it("shows each event's key information and opens its matching details page", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: event.name, level: 3 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Discover competitions" })).toBeTruthy();
    expect(screen.getByText("List view").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Northside Climbing")).toBeTruthy();
    expect(screen.getByText("Nov 14, 2026")).toBeTruthy();
    expect(screen.getByText("Toronto")).toBeTruthy();

    const detailsLink = screen.getByRole("link", { name: "View event details for Autumn Open" });
    expect(detailsLink.getAttribute("href")).toBe(`/competitions/${event._id}`);
    fireEvent.click(detailsLink);

    const details = await screen.findByRole("region", { name: "Competition event details" });
    expect(within(details).getByRole("heading", { name: event.name })).toBeTruthy();
    expect(getDiscoveredEvent).toHaveBeenCalledWith(event._id, expect.any(AbortSignal));
  });
});

describe("US025 selected event information", () => {
  it("shows event details and only the current Climber's registration", async () => {
    renderPage(`/competitions/${event._id}`);
    const details = await screen.findByRole("region", { name: "Competition event details" });
    expect(within(details).getByText("Tops and zones")).toBeTruthy();
    expect(within(details).getByText("0")).toBeTruthy();
    const registration = screen.getByRole("region", { name: "Your event registration" });
    expect(within(registration).getByText("Confirmed")).toBeTruthy();
    expect(within(registration).getByText("Division: Open division")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByRole("button", { name: /save|register|manage/i })).toBeNull();
  });
  it("handles missing optional data and does not offer a fake registration action", async () => {
    vi.mocked(getDiscoveredEvent).mockResolvedValue({ ...event, description: "", divisions: [], scoringFormat: null, myRegistration: null });
    renderPage(`/competitions/${event._id}`);
    expect(await screen.findByText("No event description has been added yet.")).toBeTruthy();
    expect(screen.getByText("No divisions have been announced yet.")).toBeTruthy(); expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.getByText("This competition is full.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Register for competition" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("marks an event that has already taken place", async () => {
    vi.mocked(getDiscoveredEvent).mockResolvedValue({ ...event, upcoming: false });
    renderPage(`/competitions/${event._id}`); expect(await screen.findByText("This competition has already taken place.")).toBeTruthy();
  });
  it("handles unavailable events without showing cached details", async () => {
    vi.mocked(getDiscoveredEvent).mockRejectedValue(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."));
    renderPage(`/competitions/${event._id}`);
    expect(await screen.findByText("Competition not found.")).toBeTruthy(); expect(screen.queryByRole("region", { name: "Competition event details" })).toBeNull();
  });
});
