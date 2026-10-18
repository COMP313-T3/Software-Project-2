import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import {
  discoverCompetitions,
  getDiscoveredEvent,
  getDiscoveryOptions,
  type DiscoveredCompetition,
  type DiscoveredEventDetails,
} from "../lib/discoveryApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/discoveryApi.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/discoveryApi.ts")>()),
  discoverCompetitions: vi.fn(),
  getDiscoveryOptions: vi.fn(),
  getDiscoveredEvent: vi.fn(),
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
  coordinates: null,
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
  coordinates: null,
};

function eventDetails(
  competition: DiscoveredCompetition,
): DiscoveredEventDetails {
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(discoverCompetitions).mockResolvedValue({
    competitions: [autumnOpen, winterJam],
    total: 2,
    page: 1,
    limit: 20,
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

describe("US-026: Competition List View", () => {
  it("opens from the Climber's menu on another page (criterion 1)", async () => {
    renderAt(`/competitions/${autumnOpen._id}`);
    await screen.findByRole("region", { name: "Competition event details" });

    fireEvent.click(
      screen.getByRole("link", { name: "Discover competitions" }),
    );

    const results = await screen.findByRole("region", {
      name: "Competition search results",
    });
    expect(await within(results).findAllByRole("listitem")).toHaveLength(2);
    expect(
      within(results).getByText("List view").getAttribute("aria-current"),
    ).toBe("page");
  });

  it("opens the Event Details page of the competition the Climber selects (criteria 4 and 5)", async () => {
    renderAt("/competitions");

    fireEvent.click(
      await screen.findByRole("link", {
        name: "View event details for Winter Bouldering Jam",
      }),
    );

    const details = await screen.findByRole("region", {
      name: "Competition event details",
    });
    expect(
      within(details).getByRole("heading", { name: "Winter Bouldering Jam" }),
    ).toBeTruthy();
    expect(within(details).getByText("Lakeshore Boulders")).toBeTruthy();
    expect(getDiscoveredEvent).toHaveBeenCalledWith(
      winterJam._id,
      expect.any(AbortSignal),
    );
    expect(getDiscoveredEvent).not.toHaveBeenCalledWith(
      autumnOpen._id,
      expect.anything(),
    );
  });
});
