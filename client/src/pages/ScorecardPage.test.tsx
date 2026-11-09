import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScorecard } from "../components/scorecard/useScorecard.ts";
import { ApiError } from "../lib/apiClient.ts";
import { initialScorecardState, type ScorecardState } from "../lib/scorecardFeed.ts";
import { SCORECARD_COMPETITION as id, scorecardFixture, sentProblemThree } from "../test/scorecardFixtures.ts";
import ScorecardPage from "./ScorecardPage.tsx";

vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "climber-one", role: "CLIMBER", email: "climber@example.com" }, logOut: vi.fn() }),
}));
vi.mock("../components/scorecard/useScorecard.ts", () => ({ useScorecard: vi.fn() }));

const refresh = vi.fn();
const reconnect = vi.fn();

function show(state: Partial<ScorecardState>) {
  vi.mocked(useScorecard).mockReturnValue({ ...initialScorecardState, ...state, refresh, reconnect });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/my-events/${id}/scorecard`]}>
      <Routes>
        <Route path="/my-events/:competitionId/scorecard" element={<ScorecardPage returnTo={`/my-events/${id}?page=2`} />} />
      </Routes>
    </MemoryRouter>,
  );
}

function detail(name: string) {
  return screen.getByText(name, { selector: "dt" }).nextElementSibling?.textContent;
}

beforeEach(() => {
  refresh.mockReset();
  reconnect.mockReset();
  show({ scorecard: scorecardFixture(), live: "live", refreshing: false });
});

afterEach(() => cleanup());

describe("US-031 #31.3 My scorecard page", () => {
  it("follows the competition from the address and goes back to the same event", () => {
    renderPage();

    expect(useScorecard).toHaveBeenCalledWith(id);
    expect(screen.getByRole("link", { name: "Back to my event" }).getAttribute("href")).toBe(`/my-events/${id}?page=2`);
    expect(document.title).toBe("US031 Scorecard Test Scorecard | TopSend");
  });

  it("shows which competition the scorecard belongs to, and the Climber's place in it", () => {
    renderPage();

    expect(screen.getByText("Scorecard for")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "US031 Scorecard Test" })).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(detail("Date")).toBe("Nov 21, 2026");
    expect(detail("Gym")).toBe("North Wall");
    expect(detail("Division")).toBe("Open");
    expect(detail("Location")).toBe("123 Wall St, Toronto");
  });

  it("shows the Climber's totals, the scoring rules and when a result was last recorded", () => {
    renderPage();

    const totals = within(screen.getByRole("region", { name: "Your totals" }));
    expect(totals.getByText("Points").nextElementSibling?.textContent).toBe("860");
    expect(totals.getByText("Completed").nextElementSibling?.textContent).toBe("2 of 5");
    expect(totals.getByText("Flashes").nextElementSibling?.textContent).toBe("1");
    expect(totals.getByText("Attempts").nextElementSibling?.textContent).toBe("6");
    expect(totals.getByText("Scoring: 20% off for each failed attempt, up to 5 attempts.")).toBeTruthy();
    expect(totals.getByText(/^Last result recorded Nov 9, 2026, 1:15/)).toBeTruthy();
  });

  it("shows every problem with its result", () => {
    renderPage();

    const progress = within(screen.getByRole("region", { name: "Route progress" }));
    expect(progress.getAllByRole("listitem")).toHaveLength(5);
    expect(progress.getByText("2 of 5 problems completed")).toBeTruthy();
  });

  it("shows that live updates are connected, and the change a live update made", () => {
    show({ scorecard: sentProblemThree(), live: "live", refreshing: false, changed: ["route-3"] });
    renderPage();

    expect(screen.getByText("Live updates connected")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Your totals" })).getByText("Points").nextElementSibling?.textContent).toBe("1220");
    expect(screen.getByText("Problem 3 was updated: Sent.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reconnect live updates" })).toBeNull();
  });

  it("reads the scorecard again on request", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Refresh scorecard" }));

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the last scorecard and offers to reconnect when live updates drop", () => {
    show({ scorecard: scorecardFixture(), live: "offline", refreshing: false, error: new ApiError(0, "LIVE_UNAVAILABLE", "Live updates are unavailable.") });
    renderPage();

    expect(screen.getByText("Live updates offline")).toBeTruthy();
    expect(screen.getByText(/^Showing the scorecard you last loaded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect live updates" }));
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it("keeps the last results and says so when a refresh fails while live updates still work", () => {
    show({ scorecard: scorecardFixture(), live: "live", refreshing: false, error: new ApiError(0, "NETWORK_ERROR", "fetch failed") });
    renderPage();

    expect(screen.getByText("Couldn't refresh your scorecard. You're still seeing the results you last loaded.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Your totals" })).getByText("Points").nextElementSibling?.textContent).toBe("860");
    expect(screen.queryByRole("button", { name: "Reconnect live updates" })).toBeNull();
  });

  it("explains a place that isn't confirmed yet", () => {
    const card = scorecardFixture();
    card.registration = { ...card.registration, status: "WAITLIST", statusLabel: "On the waitlist", confirmed: false };
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(screen.getByText("On the waitlist")).toBeTruthy();
    expect(screen.getByText("Your place isn't confirmed yet, so the gym may not record results for you until it is.")).toBeTruthy();
  });

  it("keeps the results of a cancelled competition for reference", () => {
    const card = scorecardFixture();
    card.competition.status = "CANCELLED";
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("This competition was cancelled. Your official results stay here for reference.")).toBeTruthy();
  });

  it("handles a competition without scoring, results, gym, division or location", () => {
    const card = scorecardFixture();
    card.scoring = null;
    card.lastResultAt = null;
    card.competition.gym = null;
    card.competition.location = null;
    card.registration.division = null;
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(screen.getByText("Scoring isn't set up for this competition yet, so problems don't earn points yet.")).toBeTruthy();
    expect(screen.getByText("No results have been recorded for you yet.")).toBeTruthy();
    expect(detail("Gym")).toBe("Gym unavailable");
    expect(detail("Division")).toBe("Division unavailable");
    expect(detail("Location")).toBe("Location unavailable");
  });

  it("shows a loading message until the scorecard arrives", () => {
    show({ scorecard: null, refreshing: true });
    renderPage();

    expect(screen.getByRole("status").textContent).toBe("Loading your scorecard…");
    expect(screen.queryByRole("button", { name: "Refresh scorecard" })).toBeNull();
    expect(document.title).toBe("My scorecard | TopSend");
  });

  it("explains why there's no scorecard for a competition the Climber isn't registered for", () => {
    const message = "You're not registered for this competition, so you don't have a scorecard for it.";
    show({ scorecard: null, refreshing: false, live: "offline", error: new ApiError(404, "REGISTRATION_NOT_FOUND", message) });
    renderPage();

    const alert = within(screen.getByRole("alert"));
    expect(alert.getByRole("heading", { name: "Scorecard unavailable" })).toBeTruthy();
    expect(alert.getByText(message)).toBeTruthy();
    expect(alert.queryByRole("button")).toBeNull();
  });

  it("offers to sign in again when the login ended", () => {
    show({ scorecard: null, refreshing: false, live: "offline", error: new ApiError(401, "SESSION_EXPIRED", "Session expired.") });
    renderPage();

    const alert = within(screen.getByRole("alert"));
    expect(alert.getByText("Your session has expired. Sign in again to view your scorecard.")).toBeTruthy();
    expect(alert.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("offers to try again after a network or server problem", () => {
    show({ scorecard: null, refreshing: false, live: "offline", error: new ApiError(0, "NETWORK_ERROR", "fetch failed") });
    renderPage();

    const alert = within(screen.getByRole("alert"));
    expect(alert.getByText("Couldn't load your scorecard. Please try again.")).toBeTruthy();
    fireEvent.click(alert.getByRole("button", { name: "Try again" }));
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
