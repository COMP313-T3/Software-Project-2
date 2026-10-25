import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { forgetCurrentLocation } from "../lib/currentLocation.ts";
import { discoverCompetitions, EMPTY_DISCOVERY_FILTERS, getCompetitionMap, getDiscoveredEvent, getDiscoveryOptions, type DiscoveredEventDetails, type DiscoveryResults } from "../lib/discoveryApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/discoveryApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/discoveryApi.ts")>(), discoverCompetitions: vi.fn(), getCompetitionMap: vi.fn(), getDiscoveryOptions: vi.fn(), getDiscoveredEvent: vi.fn() }));
const gymId = "507f1f77bcf86cd799439011";
const event: DiscoveredEventDetails = {
  _id: "507f1f77bcf86cd799439012", name: "Autumn Open", date: "2026-11-14", location: "Toronto", gym: { _id: gymId, name: "Northside Climbing" },
  registrationStatus: "OPEN", capacity: 80, spacesLeft: 0, full: true, coordinates: null, distanceKm: 0,
  description: "An event for the climbing community.", upcoming: true, registrationAvailable: false,
  divisions: [{ _id: "division-1", name: "Open division" }], scoringFormat: { label: "20% off for each failed attempt, up to 5 attempts" },
  myRegistration: { status: "CONFIRMED", registeredAt: "2026-10-17T12:00:00Z", division: { _id: "division-1", name: "Open division" } },
};
const results: DiscoveryResults = { competitions: [event], total: 1, page: 1, limit: 20 };
const mapResults = { pins: [{ ...event, coordinates: { lat: 43.6532, lng: -79.3832 } }], total: 1, unmapped: 0, pending: 0, truncated: false };
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
    set("Search competitions", "Autumn"); set("Gym", gymId); set("From date", "2026-11-01"); set("To date", "2026-12-01"); set("Registration", "open");
    fireEvent.click(await screen.findByRole("radio", { name: "My saved location" })); set("Distance", "25");
    expect(discoverCompetitions).toHaveBeenCalledOnce(); submit();
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, q: "Autumn", gymId, from: "2026-11-01", to: "2026-12-01", registration: "open", near: "saved", radiusKm: "25" }, 1, expect.any(AbortSignal)));
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
    expect(screen.getByText("Choose a starting point to search by distance.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("radio", { name: "My saved location" }));
    expect(screen.getByText("Only competitions whose gym has a map location are included.")).toBeTruthy();
  });
  it("shows a server field error without clearing the entered filter", async () => {
    vi.mocked(discoverCompetitions).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check filters.", { radiusKm: "Choose a starting point to search by distance." }));
    renderPage("/competitions?radiusKm=10");
    expect(await screen.findByText("Choose a starting point to search by distance.", { selector: "#discover-radiusKm-error" })).toBeTruthy();
    expect((screen.getByLabelText("Distance") as HTMLSelectElement).value).toBe("10");
    openFilters();
    expect((screen.getByRole("radio", { name: "My saved location" }) as HTMLInputElement).checked).toBe(true);
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

function geolocation(answer: { coords: { latitude: number; longitude: number } } | { code: number }) {
  const getCurrentPosition = vi.fn((found: PositionCallback, failed?: PositionErrorCallback | null) => {
    if ("coords" in answer) found({ coords: answer.coords } as GeolocationPosition);
    else failed?.({ code: answer.code, message: "" } as GeolocationPositionError);
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}
/** A browser that waits to answer, so a test can change the page while the location is being asked for. */
function geolocationWaits() {
  const questions: PositionCallback[] = [];
  const getCurrentPosition = vi.fn((found: PositionCallback) => { questions.push(found); });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return {
    getCurrentPosition,
    answer: (index: number, latitude: number, longitude: number) => act(() => questions[index]({ coords: { latitude, longitude } } as GeolocationPosition)),
  };
}
function geolocationAnswers(...answers: { latitude: number; longitude: number }[]) {
  const getCurrentPosition = vi.fn((found: PositionCallback) => { found({ coords: answers.shift() ?? { latitude: 0, longitude: 0 } } as GeolocationPosition); });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}
const address = () => screen.getByLabelText("Current address").textContent;

describe("US025 starting point (criterion 6) and US026 order (criterion 6)", () => {
  afterEach(() => { forgetCurrentLocation(); Reflect.deleteProperty(navigator, "geolocation"); });
  it("starts from where the Climber is without putting it in the address bar", async () => {
    const ask = geolocation({ coords: { latitude: 43.65321, longitude: -79.38324 } });
    renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.653", lng: "-79.383" }, 1, expect.any(AbortSignal)));
    expect(address()).toBe("/competitions?near=current");
    expect(await screen.findByText("Distances are from your current location.")).toBeTruthy();
    expect(ask).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "View event details for Autumn Open" }));
    await screen.findByRole("region", { name: "Competition event details" });
    expect(address()).toBe(`/competitions/${event._id}?near=current`);
  });
  it("says why it can't start from where the Climber is, and keeps the results", async () => {
    geolocation({ code: 1 });
    renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect((await screen.findByRole("alert")).textContent).toBe("TopSend isn't allowed to use your location. Allow it in your browser's site settings, or search for a place instead.");
    expect(address()).toBe("/competitions");
    expect(discoverCompetitions).toHaveBeenCalledOnce();
  });
  it("asks the browser again when a search that started from the Climber's location is opened again", async () => {
    const ask = geolocation({ coords: { latitude: 43.7, longitude: -79.4 } });
    renderPage("/competitions?near=current&radiusKm=25"); await ready();
    expect(ask).toHaveBeenCalledOnce();
    expect(discoverCompetitions).toHaveBeenCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.7", lng: "-79.4", radiusKm: "25" }, 1, expect.any(AbortSignal));
    expect(screen.getByText("Distances are from your current location, within 25 km.")).toBeTruthy();
  });
  it("offers to try again or search without the location when it can't be found", async () => {
    const ask = geolocation({ code: 3 });
    renderPage("/competitions?near=current&radiusKm=25&sort=closest");
    expect(await screen.findByText("Finding your location took too long. Try again, or search for a place instead.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Couldn't use your location" })).toBeTruthy();
    expect(discoverCompetitions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Search without your location" }));
    await ready();
    expect(address()).toBe("/competitions");
    expect(discoverCompetitions).toHaveBeenLastCalledWith(EMPTY_DISCOVERY_FILTERS, 1, expect.any(AbortSignal));
  });
  it("asks for the location when the filters start from it, and shows a refusal there", async () => {
    geolocation({ code: 1 });
    renderPage(); await ready(); openFilters();
    fireEvent.click(screen.getByRole("radio", { name: "My current location" }));
    expect(screen.getByText("Your browser asks before sharing your location. TopSend only uses it for this search and doesn't save it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect((await screen.findByText(/TopSend isn't allowed to use your location/)).id).toBe("discover-near-error");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "My current location" })));
    expect(address()).toBe("/competitions");
  });
  it("starts from the saved location with a preset distance", async () => {
    renderPage(); await ready(); openFilters();
    fireEvent.click(await screen.findByRole("radio", { name: "My saved location" }));
    expect(Array.from((screen.getByLabelText("Distance") as HTMLSelectElement).options, option => option.text)).toEqual(["Any distance", "Within 5 km", "Within 10 km", "Within 25 km", "Within 50 km", "Within 100 km"]);
    set("Distance", "10");
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "saved", radiusKm: "10" }, 1, expect.any(AbortSignal)));
    expect(address()).toBe("/competitions?near=saved&radiusKm=10");
    expect(screen.getByText("Distances are from your saved location, within 10 km.")).toBeTruthy();
  });
  it("only offers the saved location when the account has one, and a distance once there's a starting point", async () => {
    vi.mocked(getDiscoveryOptions).mockResolvedValue({ gyms: [], registration: [{ value: "any", label: "All upcoming competitions" }], maxRadiusKm: 200, hasSavedLocation: false });
    renderPage(); await ready(); openFilters();
    await waitFor(() => expect(getDiscoveryOptions).toHaveBeenCalled());
    expect(screen.getAllByRole("radio").map(radio => radio.closest("label")?.textContent)).toEqual(["None", "My current location"]);
    expect((screen.getByLabelText("Distance") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "My current location" }));
    expect((screen.getByLabelText("Distance") as HTMLSelectElement).disabled).toBe(false);
  });
  it("uses the newest location after asking again from the page", async () => {
    const ask = geolocationAnswers({ latitude: 43.65, longitude: -79.38 }, { latitude: 43.7, longitude: -79.4 });
    renderPage("/competitions?near=current"); await ready();
    expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.65", lng: "-79.38" }, 1, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.7", lng: "-79.4" }, 1, expect.any(AbortSignal)));
    expect(ask).toHaveBeenCalledTimes(2);
    expect(address()).toBe("/competitions?near=current");
  });
  it("uses the location found from the form over one the page found earlier", async () => {
    const ask = geolocationAnswers({ latitude: 43.65, longitude: -79.38 }, { latitude: 43.7, longitude: -79.4 });
    renderPage("/competitions?near=current"); await ready();
    openFilters(); fireEvent.click(screen.getByRole("radio", { name: "None" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(address()).toBe("/competitions")); await ready();
    const searchesBefore = vi.mocked(discoverCompetitions).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    await waitFor(() => expect(address()).toBe("/competitions?near=current"));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.7", lng: "-79.4" }, 1, expect.any(AbortSignal)));
    expect(ask).toHaveBeenCalledTimes(2);
    expect(vi.mocked(discoverCompetitions).mock.calls.slice(searchesBefore).map(([filters]) => `${filters.lat},${filters.lng}`)).toEqual(["43.7,-79.4"]);
  });
  it("keeps the order and the view chosen while Use my location waits for the browser", async () => {
    const browser = geolocationWaits();
    renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect((screen.getByRole("button", { name: "Finding your location…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "joined" } });
    await waitFor(() => expect(address()).toBe("/competitions?sort=joined"));
    await browser.answer(0, 43.65, -79.38);
    await waitFor(() => expect(address()).toBe("/competitions?near=current&sort=joined"));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.65", lng: "-79.38", sort: "joined" }, 1, expect.any(AbortSignal)));

    openFilters(); fireEvent.click(screen.getByRole("radio", { name: "None" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(address()).toBe("/competitions?sort=joined")); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    fireEvent.click(screen.getByRole("link", { name: "Map view" }));
    await waitFor(() => expect(address()).toBe("/competitions?sort=joined&view=map"));
    await browser.answer(1, 43.7, -79.4);
    await waitFor(() => expect(address()).toBe("/competitions?near=current&sort=joined&view=map"));
    await waitFor(() => expect(getCompetitionMap).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.7", lng: "-79.4", sort: "joined" }, expect.any(AbortSignal)));
  });
  it("keeps an order chosen while Apply filters waits for the browser", async () => {
    const browser = geolocationWaits();
    renderPage(); await ready(); openFilters();
    fireEvent.click(screen.getByRole("radio", { name: "My current location" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("Finding your location…", { selector: "p" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "spaces" } });
    await waitFor(() => expect(address()).toBe("/competitions?sort=spaces"));
    await browser.answer(0, 43.65, -79.38);
    await waitFor(() => expect(address()).toBe("/competitions?near=current&sort=spaces"));
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.65", lng: "-79.38", sort: "spaces" }, 1, expect.any(AbortSignal)));
    expect(browser.getCurrentPosition).toHaveBeenCalledOnce();
  });
  it("keeps focus on Sort by and Shuffle again, and the filters being edited, when the order changes", async () => {
    renderPage(); await ready(); openFilters(); set("From date", "2026-12-01");
    const sort = screen.getByLabelText("Sort by");
    sort.focus();
    fireEvent.change(sort, { target: { value: "random" } });
    await waitFor(() => expect(address()).toMatch(/^\/competitions\?sort=random&seed=\d+$/)); await ready();
    expect(screen.getByLabelText("Sort by")).toBe(sort);
    expect(document.activeElement).toBe(sort);
    expect(screen.getByRole("button", { name: "Filter" }).getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByLabelText("From date") as HTMLInputElement).value).toBe("2026-12-01");

    const shuffle = screen.getByRole("button", { name: "Shuffle again" });
    const before = address();
    shuffle.focus();
    fireEvent.click(shuffle);
    await waitFor(() => expect(address()).not.toBe(before)); await ready();
    expect(screen.getByRole("button", { name: "Shuffle again" })).toBe(shuffle);
    expect(document.activeElement).toBe(shuffle);
  });
  it("keeps focus on Sort by and Shuffle again on a later page too", async () => {
    vi.mocked(discoverCompetitions).mockImplementation(async (_filters, page = 1) => ({ ...results, total: 23, page }));
    renderPage("/competitions?page=2"); await ready();
    const sort = screen.getByLabelText("Sort by");
    sort.focus();
    fireEvent.change(sort, { target: { value: "random" } });
    await waitFor(() => expect(address()).toMatch(/^\/competitions\?sort=random&seed=\d+$/)); await ready();
    expect(screen.getByLabelText("Sort by")).toBe(sort);
    expect(document.activeElement).toBe(sort);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(address()).toMatch(/&page=2$/)); await ready();
    const shuffle = screen.getByRole("button", { name: "Shuffle again" });
    shuffle.focus(); fireEvent.click(shuffle);
    await waitFor(() => expect(address()).not.toContain("page=2")); await ready();
    expect(screen.getByRole("button", { name: "Shuffle again" })).toBe(shuffle);
    expect(document.activeElement).toBe(shuffle);
  });
  it("keeps focus when the address has its search in another order", async () => {
    renderPage("/competitions?registration=open&q=Autumn"); await ready();
    const sort = screen.getByLabelText("Sort by");
    sort.focus();
    fireEvent.change(sort, { target: { value: "joined" } });
    await waitFor(() => expect(address()).toBe("/competitions?q=Autumn&registration=open&sort=joined")); await ready();
    expect(document.activeElement).toBe(sort);
  });
  it("stays on Event Details when the location arrives after leaving the list", async () => {
    const browser = geolocationWaits();
    renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    fireEvent.click(screen.getByRole("link", { name: "View event details for Autumn Open" }));
    await screen.findByRole("region", { name: "Competition event details" });
    await browser.answer(0, 43.65, -79.38);
    await act(async () => { await Promise.resolve(); });
    expect(address()).toBe(`/competitions/${event._id}`);
  });
  it("drops a search that waited for the location when other filters were applied meanwhile", async () => {
    const browser = geolocationWaits();
    renderPage(); await ready(); openFilters();
    await screen.findByRole("option", { name: "Northside Climbing (Toronto)" });
    set("Gym", gymId);
    fireEvent.click(screen.getByRole("radio", { name: "My current location" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect((screen.getByRole("button", { name: "Clear filters" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Search Ottawa" }));
    await waitFor(() => expect(address()).toBe("/competitions?q=Ottawa"));
    await browser.answer(0, 43.65, -79.38);
    await act(async () => { await Promise.resolve(); });
    expect(address()).toBe("/competitions?q=Ottawa");
    expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, q: "Ottawa" }, 1, expect.any(AbortSignal));
  });
  it("keeps waiting for the browser across views, and shows a refusal that arrives later", async () => {
    const refusals: PositionErrorCallback[] = [];
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: vi.fn((_found: PositionCallback, failed: PositionErrorCallback) => { refusals.push(failed); }) } });
    renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    fireEvent.click(screen.getByRole("link", { name: "Map view" }));
    await waitFor(() => expect(address()).toBe("/competitions?view=map"));
    expect((screen.getByRole("button", { name: "Finding your location…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => refusals[0]({ code: 1, message: "" } as GeolocationPositionError));
    const refusal = await screen.findByText("TopSend isn't allowed to use your location. Allow it in your browser's site settings, or search for a place instead.");
    expect(refusal.getAttribute("role")).toBe("alert");
    expect(screen.getByRole("button", { name: "Use my location" })).toBeTruthy();
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledOnce();
  });
  it("keeps the applied order when filters are applied after it changed", async () => {
    renderPage(); await ready();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "joined" } });
    await waitFor(() => expect(address()).toBe("/competitions?sort=joined")); await ready();
    set("Gym", gymId);
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(address()).toBe(`/competitions?gymId=${gymId}&sort=joined`));
    expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, gymId, sort: "joined" }, 1, expect.any(AbortSignal));
  });
  it("links the Distance help to its choice", async () => {
    renderPage(); await ready(); openFilters();
    const distance = screen.getByLabelText("Distance");
    expect(distance.getAttribute("aria-describedby")).toBe("discover-radiusKm-help");
    expect(document.getElementById("discover-radiusKm-help")?.textContent).toBe("Choose a starting point to search by distance.");
    fireEvent.click(await screen.findByRole("radio", { name: "My saved location" }));
    expect(document.getElementById("discover-radiusKm-help")?.textContent).toBe("Only competitions whose gym has a map location are included.");
  });
  it("links the Distance help and its error to the choice", async () => {
    renderPage("/competitions?near=saved&radiusKm=500");
    expect(await screen.findByText("Choose a distance from 1 to 200 km.")).toBeTruthy();
    openFilters();
    expect(screen.getByLabelText("Distance").getAttribute("aria-describedby")).toBe("discover-radiusKm-help discover-radiusKm-error");
    expect(discoverCompetitions).not.toHaveBeenCalled();
  });
  it("uses the day's random order when the shuffle number in the address isn't one", async () => {
    renderPage("/competitions?sort=random&seed=abc"); await ready();
    expect(discoverCompetitions).toHaveBeenCalledWith({ ...EMPTY_DISCOVERY_FILTERS, sort: "random" }, 1, expect.any(AbortSignal));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Map view" }).getAttribute("href")).toBe("/competitions?sort=random&view=map");
  });
  it("sorts by the chosen order, and keeps one random order with its shuffle number", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    renderPage(); await ready();
    expect(Array.from((screen.getByLabelText("Sort by") as HTMLSelectElement).options, option => option.text)).toEqual(["Soonest first", "Closest first (choose a starting point)", "Most joined", "Most spaces left", "Random order"]);
    expect((screen.getByRole("option", { name: "Closest first (choose a starting point)" }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "joined" } });
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, sort: "joined" }, 1, expect.any(AbortSignal)));
    expect(address()).toBe("/competitions?sort=joined");
    await ready();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "random" } });
    await waitFor(() => expect(address()).toBe("/competitions?sort=random&seed=250000000"));
    random.mockReturnValue(0.5);
    fireEvent.click(await screen.findByRole("button", { name: "Shuffle again" }));
    await waitFor(() => expect(address()).toBe("/competitions?sort=random&seed=500000000"));
    expect(discoverCompetitions).toHaveBeenLastCalledWith({ ...EMPTY_DISCOVERY_FILTERS, sort: "random", seed: "500000000" }, 1, expect.any(AbortSignal));
    random.mockRestore();
  });
  it("only offers closest first once there's a starting point", async () => {
    renderPage("/competitions?near=saved&sort=closest"); await ready();
    expect((screen.getByRole("option", { name: "Closest first" }) as HTMLOptionElement).disabled).toBe(false);
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("closest");
    expect(discoverCompetitions).toHaveBeenCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "saved", sort: "closest" }, 1, expect.any(AbortSignal));
  });
  it("drops closest first and the distance when the starting point is removed", async () => {
    renderPage("/competitions?near=saved&radiusKm=10&sort=closest"); await ready(); openFilters();
    fireEvent.click(screen.getByRole("radio", { name: "None" }));
    expect((screen.getByLabelText("Distance") as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(address()).toBe("/competitions"));
    expect(discoverCompetitions).toHaveBeenLastCalledWith(EMPTY_DISCOVERY_FILTERS, 1, expect.any(AbortSignal));
  });
  it("keeps the order when filters are cleared, and leaves it off the map", async () => {
    renderPage(`/competitions?sort=spaces&gymId=${gymId}`); await ready(); openFilters();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(address()).toBe("/competitions?sort=spaces"));
    await ready();
    fireEvent.click(screen.getByRole("link", { name: "Map view" }));
    await screen.findByText("Google Maps couldn't load. You can still use the competition list.");
    expect(screen.queryByLabelText("Sort by")).toBeNull();
    expect(screen.getByRole("link", { name: "List view" }).getAttribute("href")).toBe("/competitions?sort=spaces");
  });
  it("shows how many Climbers joined each competition", async () => {
    vi.mocked(discoverCompetitions).mockResolvedValue({ ...results, competitions: [{ ...event, joined: 12 }] });
    renderPage(); expect(await screen.findByText("12 Climbers joined")).toBeTruthy();
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
    expect(within(details).getByText("20% off for each failed attempt, up to 5 attempts")).toBeTruthy();
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
    expect(screen.getByText("No divisions have been announced yet.")).toBeTruthy(); expect(screen.getByText("Not set")).toBeTruthy();
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
