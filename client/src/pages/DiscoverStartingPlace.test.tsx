import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { discoverCompetitions, EMPTY_DISCOVERY_FILTERS, getDiscoveryOptions, type DiscoveryResults } from "../lib/discoveryApi.ts";
import { findPlace } from "../lib/geocodeApi.ts";
import { suggestAddresses } from "../lib/googleMaps.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/discoveryApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/discoveryApi.ts")>(), discoverCompetitions: vi.fn(), getDiscoveryOptions: vi.fn() }));
vi.mock("../lib/googleMaps.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/googleMaps.ts")>(),
  GOOGLE_MAPS_API_KEY: "key-for-tests",
  newSuggestionSession: vi.fn(async () => ({})),
  suggestAddresses: vi.fn(),
  loadGoogleMaps: vi.fn(() => Promise.reject(new Error("offline"))),
}));
vi.mock("../lib/geocodeApi.ts", () => ({ findPlace: vi.fn(), findAddressAt: vi.fn() }));

const UNION = { placeId: "place-union", text: { text: "Union Station, Toronto, ON, Canada" }, mainText: { text: "Union Station" }, secondaryText: { text: "Toronto, ON, Canada" } };
const FOUND = { address: "65 Front St W, Toronto, ON M5J 1E6", postalCode: "M5J 1E6", country: "CA", location: { lat: 43.645512, lng: -79.380711 } };
const results: DiscoveryResults = {
  competitions: [{ _id: "507f1f77bcf86cd799439012", name: "Autumn Open", date: "2026-11-14", location: "Toronto", gym: { _id: "507f1f77bcf86cd799439011", name: "Northside Climbing" }, registrationStatus: "OPEN", capacity: 80, spacesLeft: 40, full: false, joined: 40, coordinates: null, distanceKm: 1.2 }],
  total: 1, page: 1, limit: 20,
};
function Address() { const location = useLocation(); return <output aria-label="Current address">{location.pathname + location.search}</output>; }
function renderPage(url = "/competitions") { return render(<MemoryRouter initialEntries={[url]}><Address /><App /></MemoryRouter>); }
const ready = () => screen.findByRole("heading", { name: "Autumn Open", level: 3 });
const address = () => screen.getByLabelText("Current address").textContent;
const placeInput = () => screen.getByRole("combobox", { name: "Place" }) as HTMLInputElement;
function openFilters() { fireEvent.click(screen.getByRole("button", { name: "Filter" })); }

beforeEach(() => {
  vi.mocked(discoverCompetitions).mockReset().mockResolvedValue(results);
  vi.mocked(getDiscoveryOptions).mockReset().mockResolvedValue({ gyms: [], registration: [{ value: "any", label: "All upcoming competitions" }], maxRadiusKm: 200, hasSavedLocation: false });
  vi.mocked(suggestAddresses).mockReset().mockResolvedValue([UNION]);
  vi.mocked(findPlace).mockReset().mockResolvedValue(FOUND);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "climber-id", role: "CLIMBER", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber-id", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US025 starting from a place the Climber searches for (criterion 6)", () => {
  it("starts from a place picked from the suggestions, keeping its name and point in the address", async () => {
    renderPage(); await ready(); openFilters();
    fireEvent.click(screen.getByRole("radio", { name: "A place I search for" }));
    fireEvent.change(placeInput(), { target: { value: "Union" } });
    fireEvent.click(await screen.findByRole("option", { name: /Union Station/ }));
    expect(await screen.findByText("Starting from 65 Front St W, Toronto, ON M5J 1E6.")).toBeTruthy();
    expect(findPlace).toHaveBeenCalledWith("place-union");
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    const place = { ...EMPTY_DISCOVERY_FILTERS, near: "place", lat: "43.6455", lng: "-79.3807", place: "65 Front St W, Toronto, ON M5J 1E6" };
    await waitFor(() => expect(discoverCompetitions).toHaveBeenLastCalledWith(place, 1, expect.any(AbortSignal)));
    expect(address()).toBe("/competitions?near=place&lat=43.6455&lng=-79.3807&place=65+Front+St+W%2C+Toronto%2C+ON+M5J+1E6");
    expect(await screen.findByText("Distances are from 65 Front St W, Toronto, ON M5J 1E6.")).toBeTruthy();
  });
  it("asks for a place to be picked when it's only typed, and stays on the place", async () => {
    renderPage(); await ready(); openFilters();
    fireEvent.click(screen.getByRole("radio", { name: "A place I search for" }));
    fireEvent.change(placeInput(), { target: { value: "Somewhere" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText("Choose a place from the suggestions or on the map.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(placeInput()));
    expect(placeInput().getAttribute("aria-invalid")).toBe("true");
    expect(discoverCompetitions).toHaveBeenCalledOnce();
  });
  it("opens a search that starts from a place with the place filled in", async () => {
    renderPage("/competitions?near=place&lat=43.6455&lng=-79.3807&place=Union+Station"); await ready();
    expect(discoverCompetitions).toHaveBeenCalledWith({ ...EMPTY_DISCOVERY_FILTERS, near: "place", lat: "43.6455", lng: "-79.3807", place: "Union Station" }, 1, expect.any(AbortSignal));
    openFilters();
    expect(placeInput().value).toBe("Union Station");
    expect(screen.getByText("Starting from Union Station.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pin saved. Edit on map" })).toBeTruthy();
  });
});
