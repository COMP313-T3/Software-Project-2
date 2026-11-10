import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScorecard } from "../components/scorecard/useScorecard.ts";
import { ApiError } from "../lib/apiClient.ts";
import { clearMyResult, saveMyResult } from "../lib/scorecardApi.ts";
import { initialScorecardState, type ScorecardState } from "../lib/scorecardFeed.ts";
import { SCORECARD_COMPETITION as id, scorecardFixture, sentProblemThree } from "../test/scorecardFixtures.ts";
import ScorecardPage from "./ScorecardPage.tsx";

vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "climber-one", role: "CLIMBER", email: "climber@example.com" }, logOut: vi.fn() }),
}));
vi.mock("../components/scorecard/useScorecard.ts", () => ({ useScorecard: vi.fn() }));
vi.mock("../lib/displaySettingsApi.ts", () => ({
  getPublicDisplay: vi.fn(async (competitionId: string) => ({ competitionId, settings: { logo: null, background: null, sponsors: [] } })),
}));
vi.mock("../lib/climberAssistantApi.ts", async (original) => ({
  ...(await original<typeof import("../lib/climberAssistantApi.ts")>()),
  getClimberAssistant: vi.fn(() => new Promise(() => {})),
}));
vi.mock("../lib/scorecardApi.ts", async (original) => ({
  ...(await original<typeof import("../lib/scorecardApi.ts")>()),
  saveMyResult: vi.fn(),
  clearMyResult: vi.fn(),
}));

const refresh = vi.fn();
const reconnect = vi.fn();
const apply = vi.fn();

function show(state: Partial<ScorecardState>) {
  vi.mocked(useScorecard).mockReturnValue({ ...initialScorecardState, ...state, refresh, reconnect, apply });
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
  apply.mockReset();
  vi.mocked(saveMyResult).mockReset().mockResolvedValue(sentProblemThree());
  vi.mocked(clearMyResult).mockReset().mockResolvedValue(scorecardFixture());
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

    const panel = within(screen.getByRole("region", { name: "US031 Scorecard Test" }));
    expect(panel.getByText("Scorecard for")).toBeTruthy();
    expect(panel.getByText("Confirmed")).toBeTruthy();
    expect(panel.getByText("Location").nextElementSibling?.textContent).toBe("123 Wall St, Toronto");
    expect(detail("Name")).toBe("Sam Rivera");
    expect(detail("Date")).toBe("Nov 21, 2026");
    expect(detail("Gym")).toBe("North Wall");
    expect(detail("Division")).toBe("Open");
  });

  it("shows the Climber's totals, the scoring rules and when a result was last recorded", () => {
    renderPage();

    const totals = within(screen.getByRole("region", { name: "Your totals" }));
    expect(totals.getByText("Points").nextElementSibling?.textContent).toBe("860");
    expect(totals.getByText("Completed").nextElementSibling?.textContent).toBe("2 of 5");
    expect(totals.getByText("Attempts").nextElementSibling?.textContent).toBe("6");
    expect(totals.queryByText("Flashes")).toBeNull();
    expect(totals.queryByRole("button")).toBeNull();
    expect(totals.getByText("Scoring: 20% off for each failed attempt, up to 5 attempts.")).toBeTruthy();
    expect(totals.getByText(/^Last result recorded Nov 9, 2026, 1:15/)).toBeTruthy();
  });

  it("shows the scorecard sheet in the page, with every problem and its attempts out of the limit", () => {
    renderPage();

    const sheet = within(screen.getByRole("region", { name: "US031 Scorecard Test Scorecard" }));
    expect(sheet.getAllByRole("rowheader", { name: /^(Crimp Ladder|Problem \d+)/ })).toHaveLength(5);
    expect(sheet.getByText("2 of 5 problems completed")).toBeTruthy();
    expect(sheet.getByText("2 of 5 attempts")).toBeTruthy();
    expect(sheet.getByRole("rowheader", { name: "Total score" }).nextElementSibling?.textContent).toBe("860");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "View score sheet" })).toBeNull();
    expect(screen.queryByText(/flash/i)).toBeNull();
  });

  it("shows that live updates are connected, and the change a live update made", () => {
    show({ scorecard: sentProblemThree(), live: "live", refreshing: false, changed: ["route-3"] });
    renderPage();

    expect(screen.getByText("Live updates connected")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Your totals" })).getByText("Points").nextElementSibling?.textContent).toBe("1220");
    expect(screen.getByText("Problem 3 was updated: Sent.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reconnect live updates" })).toBeNull();
  });

  it("AC-022 has the AI Route Assistant's chatbot for this competition's scorecard", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    const chat = within(screen.getByRole("dialog", { name: "AI Route Assistant" }));
    expect(chat.getByText("US031 Scorecard Test, My scorecard")).toBeTruthy();
    expect(chat.getByRole("heading", { name: "Welcome to the AI Route Assistant" })).toBeTruthy();
  });

  it("AC-022 has no chatbot until there's a scorecard", () => {
    show({ scorecard: null, refreshing: true });
    renderPage();

    expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
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
    card.selfScoring = { open: false, reason: "NOT_CONFIRMED" };
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(screen.getByText("On the waitlist")).toBeTruthy();
    expect(screen.getByText("Your place isn't confirmed yet, so you can't record results until it is.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Add attempt/ })).toBeNull();
  });

  it("keeps the results of a cancelled competition for reference", () => {
    const card = scorecardFixture();
    card.competition.status = "CANCELLED";
    card.selfScoring = { open: false, reason: "CANCELLED" };
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("This competition was cancelled. Your results stay here for reference.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Add attempt/ })).toBeNull();
  });

  it("lets the Climber record their own attempts and sends while scoring is open", async () => {
    renderPage();

    expect(
      screen.getByText("Record your attempts and sends on your scorecard sheet. TopSend works out your points."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Scoring is open today. After each try, tap Add attempt on the problem's row, or Sent it when you top out. Undo takes back your last attempt.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add attempt on Problem 3" }));

    await waitFor(() => expect(apply).toHaveBeenCalledWith(sentProblemThree()));
    expect(saveMyResult).toHaveBeenCalledWith(id, "route-3", { attempts: 3, sent: false });
  });

  it("clears the result when the Climber takes back their only attempt", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Undo last attempt on Crimp Ladder" }));

    await waitFor(() => expect(apply).toHaveBeenCalledWith(scorecardFixture()));
    expect(clearMyResult).toHaveBeenCalledWith(id, "route-1");
    expect(saveMyResult).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_STARTED", "You can record your results from the start of the competition, Nov 21, 2026."],
    ["CLOSED", "This competition is over, so your results are final."],
    ["NO_SCORING", "The gym hasn't set up scoring yet, so you can't record results yet."],
  ] as const)("explains why results can't be recorded (%s)", (reason, message) => {
    const card = scorecardFixture();
    card.selfScoring = { open: false, reason };
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByText("Your scorecard sheet, with your attempts and points on each problem.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Add attempt|Sent it|Undo)/ })).toBeNull();
  });

  it("reads the scorecard again when a save is refused because scoring has closed", async () => {
    const message = "This competition is over, so your results can't be changed anymore.";
    vi.mocked(saveMyResult).mockRejectedValue(new ApiError(409, "SCORING_CLOSED", message));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Sent it on Problem 3" }));

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(refresh).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
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
    expect(detail("Gym")).toBe("Not available");
    expect(detail("Division")).toBe("Not available");
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

describe("AC-021 the scorecard before the competition starts", () => {
  const STARTS_AT = "2026-11-21T15:00:00.000Z";
  const notStarted = () =>
    new ApiError(
      409,
      "COMPETITION_NOT_STARTED",
      "This competition starts on November 21, 2026 at 10:00 a.m. Your scorecard and the leaderboard open then.",
      undefined,
      { startsAt: STARTS_AT },
    );

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-21T14:59:58.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the countdown instead of an error, with the registration status still to open", () => {
    show({ scorecard: null, error: notStarted(), live: "connecting", refreshing: false });
    renderPage();

    expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
    const panel = screen.getByRole("region", { name: "This competition hasn't started yet" });
    expect(within(panel).getByText(/^Your scorecard opens when the competition starts\./)).toBeTruthy();
    expect(within(panel).getByText(/^Starts/).textContent).toBe("Starts Nov 21, 2026, 10:00 a.m. (Toronto time)");
    expect(within(panel).getByRole("timer").textContent).toContain("2 seconds left");
    expect(within(panel).getByRole("link", { name: "Registration status" }).getAttribute("href")).toBe(
      `/my-events/${id}/registration?page=2`,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Scorecard unavailable")).toBeNull();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it("asks for the scorecard again when the start comes, and keeps the countdown while it loads", () => {
    show({ scorecard: null, error: notStarted(), live: "connecting", refreshing: false });
    const view = renderPage();

    act(() => void vi.advanceTimersByTime(2000));
    expect(reconnect).toHaveBeenCalledTimes(1);

    show({ scorecard: null, error: notStarted(), live: "connecting", refreshing: true });
    view.rerender(
      <MemoryRouter initialEntries={[`/my-events/${id}/scorecard`]}>
        <Routes>
          <Route path="/my-events/:competitionId/scorecard" element={<ScorecardPage returnTo={`/my-events/${id}?page=2`} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "This competition hasn't started yet" })).toBeTruthy();
    expect(screen.queryByText("Loading your scorecard…")).toBeNull();
    act(() => void vi.advanceTimersByTime(1999));
    expect(reconnect).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it("shows the scorecard once the server opens it", () => {
    show({ scorecard: null, error: notStarted(), live: "connecting", refreshing: false });
    const view = renderPage();
    show({ scorecard: scorecardFixture(), live: "live", refreshing: false });
    view.rerender(
      <MemoryRouter initialEntries={[`/my-events/${id}/scorecard`]}>
        <Routes>
          <Route path="/my-events/:competitionId/scorecard" element={<ScorecardPage returnTo={`/my-events/${id}?page=2`} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("region", { name: "This competition hasn't started yet" })).toBeNull();
    expect(screen.getByRole("heading", { name: "US031 Scorecard Test" })).toBeTruthy();
  });

  it("shows the start time with the date once the scorecard is open", () => {
    const card = scorecardFixture();
    card.competition.startTime = "10:00";
    card.competition.startsAt = STARTS_AT;
    show({ scorecard: card, live: "live", refreshing: false });
    renderPage();

    expect(detail("Date")).toBe("Nov 21, 2026, 10:00 a.m.");
  });
});
