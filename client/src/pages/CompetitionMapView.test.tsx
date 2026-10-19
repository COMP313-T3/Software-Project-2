import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import {
  discoverCompetitions,
  getCompetitionMap,
  getDiscoveredEvent,
  getDiscoveryOptions,
  type DiscoveredCompetition,
  type DiscoveredEventDetails,
} from "../lib/discoveryApi.ts";
import { loadGoogleMaps } from "../lib/googleMaps.ts";
import * as sessionApi from "../lib/sessionApi.ts";
import { fakeGoogleMaps } from "../test/fakeGoogleMaps.ts";

vi.mock("../lib/discoveryApi.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/discoveryApi.ts")>()),
  discoverCompetitions: vi.fn(),
  getCompetitionMap: vi.fn(),
  getDiscoveryOptions: vi.fn(),
  getDiscoveredEvent: vi.fn(),
}));
vi.mock("../lib/googleMaps.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/googleMaps.ts")>()),
  loadGoogleMaps: vi.fn(),
}));

const autumnOpen: DiscoveredCompetition = {
  _id: "507f1f77bcf86cd799439012",
  name: "Autumn Open",
  date: "2026-11-14",
  location: "Toronto",
  gym: { _id: "507f1f77bcf86cd799439011", name: "Northside Climbing" },
  registrationStatus: "OPEN",
  capacity: 80,
  spacesLeft: 12,
  full: false,
  coordinates: { lat: 43.6532, lng: -79.3832 },
};

const winterJam: DiscoveredCompetition = {
  _id: "507f1f77bcf86cd799439013",
  name: "Winter Bouldering Jam",
  date: "2026-12-05",
  location: "Mississauga",
  gym: { _id: "507f1f77bcf86cd799439014", name: "Lakeshore Boulders" },
  registrationStatus: "CLOSED",
  capacity: 40,
  spacesLeft: 0,
  full: true,
  coordinates: { lat: 43.5891, lng: -79.6441 },
};

function eventDetails(competition: DiscoveredCompetition): DiscoveredEventDetails {
  return {
    ...competition,
    description: "",
    upcoming: true,
    registrationAvailable: false,
    divisions: [],
    scoringFormat: null,
    myRegistration: null,
  };
}

let google = fakeGoogleMaps();

function Address() {
  const location = useLocation();
  return <output aria-label="Current address">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Address />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  google = fakeGoogleMaps();
  vi.mocked(loadGoogleMaps).mockResolvedValue(google.api);
  vi.mocked(discoverCompetitions).mockResolvedValue({
    competitions: [autumnOpen, winterJam],
    total: 2,
    page: 1,
    limit: 20,
  });
  vi.mocked(getCompetitionMap).mockResolvedValue({
    pins: [autumnOpen, winterJam],
    total: 2,
    unmapped: 0,
    truncated: false,
  });
  vi.mocked(getDiscoveryOptions).mockResolvedValue({
    gyms: [],
    registration: [{ value: "any", label: "All upcoming competitions" }],
    maxRadiusKm: 200,
    hasSavedLocation: false,
  });
  vi.mocked(getDiscoveredEvent).mockImplementation(async (competitionId) =>
    eventDetails(competitionId === winterJam._id ? winterJam : autumnOpen),
  );
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
    csrfToken: "csrf-token-for-tests",
    sessionCookie: true,
  });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({
    userId: "climber-id",
    role: "CLIMBER",
    token: "access-token",
    expiresAt: "2040-01-01T00:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "climber-id",
    email: "climber@example.com",
    role: "CLIMBER",
    session: { expiresIn: 3600, limitReached: false },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openMapView() {
  renderAt("/competitions?q=Open");
  const views = await screen.findByRole("navigation", { name: "Competition views" });
  fireEvent.click(within(views).getByRole("link", { name: "Map view" }));
  await screen.findByRole("region", { name: "Competition map" });
  await waitFor(() => expect(google.shownMarkers()).toHaveLength(2));
}

describe("US-027: Competition Map View", () => {
  it("opens from the Discover competitions page with the current search (criterion 1)", async () => {
    await openMapView();

    expect(screen.getByLabelText("Current address").textContent).toBe(
      "/competitions?q=Open&view=map",
    );
    expect(
      screen.getByRole("link", { name: "Map view" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(getCompetitionMap).toHaveBeenCalledWith(
      expect.objectContaining({ q: "Open" }),
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("2 competitions found")).toBeTruthy();
  });

  it("shows each available competition as a pin on the Google map (criteria 2 and 3)", async () => {
    await openMapView();

    expect(google.maps).toHaveLength(1);
    expect(google.shownMarkers().map(({ title }) => title)).toEqual([
      "Autumn Open at Northside Climbing",
      "Winter Bouldering Jam at Lakeshore Boulders",
    ]);
  });

  it("opens Event Details from the selected pin, and Back to discovery returns to the map (criteria 4 to 6)", async () => {
    await openMapView();

    act(() => google.shownMarkers()[1].clickPin());
    const card = await screen.findByRole("region", { name: "Lakeshore Boulders" });
    expect(within(card).getByText("Dec 5, 2026")).toBeTruthy();
    expect(within(card).getByText("Full, no spaces left")).toBeTruthy();
    fireEvent.click(
      within(card).getByRole("link", { name: "View event details for Winter Bouldering Jam" }),
    );

    const details = await screen.findByRole("region", { name: "Competition event details" });
    expect(within(details).getByRole("heading", { name: "Winter Bouldering Jam" })).toBeTruthy();
    expect(getDiscoveredEvent).toHaveBeenCalledWith(winterJam._id, expect.any(AbortSignal));

    fireEvent.click(screen.getByRole("link", { name: "Back to discovery" }));

    await screen.findByRole("region", { name: "Competition map" });
    expect(screen.getByLabelText("Current address").textContent).toBe(
      "/competitions?q=Open&view=map",
    );
  });

  it("keeps the List view one click away from the map", async () => {
    await openMapView();

    fireEvent.click(screen.getByRole("link", { name: "List view" }));

    const results = await screen.findByRole("region", { name: "Competition search results" });
    expect(await within(results).findAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("Current address").textContent).toBe("/competitions?q=Open");
  });
});
