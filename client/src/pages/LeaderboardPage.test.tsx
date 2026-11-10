import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { followLeaderboard, initialLeaderboardState, type LeaderboardState } from "../lib/leaderboardFeed.ts";
import { ApiError } from "../lib/apiClient.ts";
import * as sessionApi from "../lib/sessionApi.ts";
import { boardFixture, BOARD_COMPETITION as id, BOARD_DIVISION as division } from "../test/leaderboardFixtures.ts";
vi.mock("../lib/leaderboardFeed.ts", async original => ({ ...await original<typeof import("../lib/leaderboardFeed.ts")>(), followLeaderboard: vi.fn() }));
vi.mock("../lib/climberAssistantApi.ts", async original => ({ ...await original<typeof import("../lib/climberAssistantApi.ts")>(), getClimberAssistant: vi.fn(() => new Promise(() => {})) }));
vi.mock("../lib/routeAssistantApi.ts", async original => ({ ...await original<typeof import("../lib/routeAssistantApi.ts")>(), getRouteAssistant: vi.fn(() => new Promise(() => {})) }));
vi.mock("../lib/displaySettingsApi.ts", () => ({ displayGateway: { load: vi.fn(async (competitionId: string) => ({ competitionId, settings: { logo: null, background: null, sponsors: [] } })) }, getPublicDisplay: vi.fn(async (competitionId: string) => ({ competitionId, settings: { logo: null, background: null, sponsors: [] } })) }));
let snapshot: LeaderboardState, update: (state: LeaderboardState) => void;
const refresh = vi.fn(), reconnect = vi.fn(), close = vi.fn();
const path = `/gym-admin/competitions/${id}/leaderboard`;
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate(path.replace(id, "other-event"))}>Choose another event</button>; }
function renderPage(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
async function ready() { return screen.findByRole("heading", { name: "Brian Boulder Open" }); }
beforeEach(() => {
  snapshot = { board: boardFixture(), error: null, live: "live", refreshing: false };
  refresh.mockReset(); reconnect.mockReset(); close.mockReset();
  vi.mocked(followLeaderboard).mockReset().mockImplementation((_id, _audience, callback) => { update = callback; callback(snapshot); return { refresh, reconnect, close }; });
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "judge", role: "GYM_ADMIN", token: "fixture", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "judge", email: "judge@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("US-020 #173/#174 leaderboard page and live state", () => {
  it("shows the selected competition, gym, division and server scores/shared positions", async () => {
    renderPage(); await ready(); expect(followLeaderboard).toHaveBeenCalledWith(id, "manage", expect.any(Function));
    expect(screen.getByText("Brian Test Gym")).toBeTruthy(); const table = screen.getByRole("table", { name: "Open rankings" });
    expect(within(table).getAllByRole("row")).toHaveLength(4); expect(within(table).getByRole("rowheader", { name: /Ada Climber/ })).toBeTruthy();
    expect(within(table).getAllByText("Tied")).toHaveLength(2); expect(within(table).getByText("180")).toBeTruthy();
    expect(screen.getByText("No confirmed Climbers in this division yet.")).toBeTruthy(); expect(screen.getByText("Live updates connected")).toBeTruthy();
  });
  it("keeps competition filters on the return link", async () => {
    renderPage(path + `?period=past&page=2&divisionId=${division}`); await ready();
    expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toBe(`/gym-admin/competitions/${id}?period=past&page=2`);
  });
  it("filters the server's division snapshots without reconnecting or recalculating ranks", async () => {
    renderPage(); await ready(); fireEvent.change(screen.getByLabelText("Division"), { target: { value: "youth" } });
    expect(screen.queryByRole("table")).toBeNull(); expect(screen.getByRole("heading", { name: "Youth" })).toBeTruthy();
    expect(followLeaderboard).toHaveBeenCalledOnce(); fireEvent.change(screen.getByLabelText("Division"), { target: { value: division } });
    expect(screen.getByRole("table", { name: "Open rankings" })).toBeTruthy(); expect(reconnect).not.toHaveBeenCalled();
  });
  it("explains a removed division and allows choosing All divisions", async () => {
    renderPage(path + "?divisionId=removed"); await ready(); expect(screen.getByRole("heading", { name: "Division unavailable" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull(); fireEvent.change(screen.getByLabelText("Division"), { target: { value: "" } });
    expect(screen.getByRole("table", { name: "Open rankings" })).toBeTruthy();
  });
  it("shows loading before standings exist", async () => {
    snapshot = { ...initialLeaderboardState }; renderPage(); await screen.findByText("Loading leaderboard…"); expect(screen.queryByRole("table")).toBeNull();
  });
  it("handles a competition without divisions or results", async () => {
    snapshot.board!.divisions = []; snapshot.board!.lastResultAt = null; snapshot.board!.scoring = null;
    renderPage(); await ready(); expect(screen.getByRole("heading", { name: "No divisions yet" })).toBeTruthy(); expect(screen.getByText(/No official results recorded yet/)).toBeTruthy();
    expect(screen.getByText(/Scoring is not configured yet/)).toBeTruthy();
  });
  it("replaces the visible ranks after a live update without navigating or adding duplicates", async () => {
    renderPage(); await ready(); const next = structuredClone(snapshot); next.board!.divisions[0].standings[0].totalScore = 260;
    act(() => update(next)); expect(screen.getByText("260")).toBeTruthy(); expect(screen.queryByText("180")).toBeNull();
    act(() => update(next)); expect(screen.getAllByRole("rowheader", { name: /Ada Climber/ })).toHaveLength(1); expect(followLeaderboard).toHaveBeenCalledOnce();
  });
  it.each(["connecting", "reconnecting", "offline"] as const)("keeps the table usable with an honest %s indicator", async live => {
    snapshot.live = live; renderPage(); await ready(); expect(screen.getByRole("table", { name: "Open rankings" })).toBeTruthy();
    expect(screen.getByText(/Showing the last loaded standings/)).toBeTruthy(); expect(screen.queryByText("Live updates connected")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh standings" })); expect(refresh).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect live updates" })); expect(reconnect).toHaveBeenCalledOnce();
  });
  it("offers safe retry feedback after an initial error", async () => {
    snapshot = { board: null, error: new Error("private database password"), live: "offline", refreshing: false };
    renderPage(); await screen.findByRole("heading", { name: "Leaderboard unavailable" }); expect(screen.getByText("Couldn't load the leaderboard. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private database/)).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(reconnect).toHaveBeenCalledOnce();
  });
  it("removes standings when access is lost and links an expired session to sign in", async () => {
    renderPage(); await ready(); act(() => update({ board: null, error: new ApiError(401, "SESSION_EXPIRED", "Sign in again."), live: "offline", refreshing: false }));
    expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByText("Brian Boulder Open")).toBeNull(); expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
  it("shows the server's basic Climber view and marks their row", async () => {
    snapshot.board = boardFixture("climber"); vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
    renderPage(`/competitions/${id}/leaderboard`); await ready(); expect(followLeaderboard).toHaveBeenCalledWith(id, "climber", expect.any(Function));
    expect(screen.getByText("You")).toBeTruthy(); expect(screen.queryByRole("link", { name: "Open public leaderboard" })).toBeNull();
  });
  it("allows Visitors to open the public read-only view without protected navigation", async () => {
    snapshot.board = boardFixture("public"); vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(`/leaderboards/${id}`); await ready(); expect(followLeaderboard).toHaveBeenCalledWith(id, "public", expect.any(Function));
    expect(screen.getByText("Public competition display")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to competition" })).toBeNull(); expect(screen.queryByRole("button", { name: /Record|Save|Edit/ })).toBeNull();
  });
  it("does not show a public link while public viewing is off", async () => {
    snapshot.board!.competition.publicLeaderboard = false; renderPage(); await ready(); expect(screen.getByText("Public leaderboard viewing is off.")).toBeTruthy(); expect(screen.queryByRole("link", { name: "Open public leaderboard" })).toBeNull();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s from the managed leaderboard before subscribing", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); await screen.findByRole("heading", { name: "Gym administrator access required" }); expect(followLeaderboard).not.toHaveBeenCalled();
  });
  it("sends a Visitor opening a private board to login", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false }); renderPage(); await screen.findByRole("heading", { name: "Welcome back" }); expect(followLeaderboard).not.toHaveBeenCalled();
  });
  it("closes the old competition feed and hides its rows when changing competition", async () => {
    renderPage(); await ready(); snapshot = { ...initialLeaderboardState }; fireEvent.click(screen.getByRole("button", { name: "Choose another event" }));
    await screen.findByText("Loading leaderboard…"); expect(screen.queryByText("Brian Boulder Open")).toBeNull(); expect(close).toHaveBeenCalledOnce();
    expect(followLeaderboard).toHaveBeenLastCalledWith("other-event", "manage", expect.any(Function));
  });
});

describe("US-032 #32.3 the Climber's ranking view", () => {
  function asClimber() {
    snapshot.board = boardFixture("climber");
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  }
  const divisionHeadings = () => screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent).filter(name => name === "Open" || name === "Youth");

  it("opens the competition's live standings in ranking order, with position and points", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    expect(followLeaderboard).toHaveBeenCalledWith(id, "climber", expect.any(Function));
    const table = screen.getByRole("table", { name: "Open rankings" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(row => within(row).getByRole("rowheader").textContent?.replace(/You|\d+ results? recorded/g, ""))).toEqual(["Ada Climber", "Ben Sender", "Cara Climber"]);
    expect(rows.map(row => row.querySelector("td")?.textContent)).toEqual(["Position 1", "Position 2Tied", "Position 2Tied"]);
    expect(within(rows[0]).getByText("180")).toBeTruthy();
    expect(screen.getByText("Brian Test Gym")).toBeTruthy();
    expect(screen.getByText("Live updates connected")).toBeTruthy();
  });

  it("shows the Climber's own division only, without a division to choose, and keeps the server's ranks", async () => {
    asClimber();
    snapshot.board!.divisions.reverse();
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    expect(divisionHeadings()).toEqual(["Open"]);
    expect(screen.queryByLabelText("Division")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Your division").nextElementSibling?.textContent).toBe("Open");
    const rows = within(screen.getByRole("table", { name: "Open rankings" })).getAllByRole("row").slice(1);
    expect(rows.map(row => row.querySelector("td")?.textContent)).toEqual(["Position 1", "Position 2Tied", "Position 2Tied"]);
  });

  it("keeps showing the Climber's own division when the address names another one", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard?divisionId=youth`); await ready();

    expect(divisionHeadings()).toEqual(["Open"]);
    expect(screen.queryByRole("heading", { name: "Division unavailable" })).toBeNull();
  });

  it("moves to the Climber's new division when a Gym Admin reassigns them", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();
    const next = structuredClone(snapshot);
    const [open, youth] = next.board!.divisions;
    youth.standings = [{ ...open.standings[1], rank: 1, tied: false }];
    youth.climberCount = 1;
    open.standings = [open.standings[0], { ...open.standings[2], tied: false }];
    open.climberCount = 2;
    next.board!.myEntry = { ...next.board!.myEntry!, division: { _id: "youth", name: "Youth" }, rank: 1, tied: false, of: 1, pointsBehindLeader: 0, placeAbove: null };
    next.board!.myRegistration = { status: "CONFIRMED", division: { _id: "youth", name: "Youth" } };

    act(() => update(next));

    expect(divisionHeadings()).toEqual(["Youth"]);
    expect(screen.getByText("Your division").nextElementSibling?.textContent).toBe("Youth");
  });

  it("shows every division, still without a division to choose, to a Climber who isn't registered", async () => {
    asClimber();
    snapshot.board!.myEntry = null;
    snapshot.board!.myRegistration = null;
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    expect(divisionHeadings()).toEqual(["Open", "Youth"]);
    expect(screen.queryByLabelText("Division")).toBeNull();
    expect(screen.queryByText("Your division")).toBeNull();
  });

  it("keeps the division to choose on the public display", async () => {
    snapshot.board = boardFixture("public");
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(`/leaderboards/${id}`); await ready();

    fireEvent.change(screen.getByLabelText("Division"), { target: { value: "youth" } });

    expect(divisionHeadings()).toEqual(["Youth"]);
  });

  it("keeps the server's division order and the division to choose for Gym Admins", async () => {
    snapshot.board!.divisions.reverse();
    renderPage(); await ready();

    expect(divisionHeadings()).toEqual(["Youth", "Open"]);
    expect((screen.getByLabelText("Division") as HTMLSelectElement).value).toBe("");
  });

  it("shows new rankings from a live update without reloading", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();
    const next = structuredClone(snapshot);
    const open = next.board!.divisions[0];
    open.standings = [{ ...open.standings[2], rank: 1, tied: false, totalScore: 300 }, { ...open.standings[0], rank: 2, tied: false }, { ...open.standings[1], rank: 3, tied: false }];

    act(() => update(next));

    const rows = within(screen.getByRole("table", { name: "Open rankings" })).getAllByRole("row").slice(1);
    expect(rows.map(row => within(row).getByRole("rowheader").textContent?.replace(/You|\d+ results? recorded/g, ""))).toEqual(["Cara Climber", "Ada Climber", "Ben Sender"]);
    expect(followLeaderboard).toHaveBeenCalledOnce();
  });

  it("explains that equal totals share a place", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    expect(screen.getByText("Highest total score")).toBeTruthy();
    expect(screen.getByText("Climbers with equal totals share a place and are listed by name.")).toBeTruthy();
  });
});

describe("US-032 #32.4 the Climber's highlighted position", () => {
  function asClimber() {
    snapshot.board = boardFixture("climber");
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  }
  const myRow = () => document.getElementById("my-standing-row");

  it("shows the Climber's position with the standings and highlights their row", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    const position = within(screen.getByRole("region", { name: "Your position" }));
    expect(position.getByText("2nd")).toBeTruthy();
    expect(position.getByText("of 3 Climbers in Open")).toBeTruthy();
    expect(within(myRow()!).getByRole("rowheader").textContent).toContain("Ben Sender");
    expect(within(myRow()!).getByText("You")).toBeTruthy();
    expect(screen.getAllByText("You")).toHaveLength(1);
  });

  it("shows no position to Gym Admins", async () => {
    renderPage(); await ready();

    expect(screen.queryByRole("region", { name: "Your position" })).toBeNull();
    expect(myRow()).toBeNull();
  });

  it("moves the highlight and the position when the ranking changes", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();
    const next = structuredClone(snapshot);
    const open = next.board!.divisions[0];
    open.standings = [{ ...open.standings[1], rank: 1, tied: false, totalScore: 200 }, { ...open.standings[0], rank: 2, tied: false }, { ...open.standings[2], rank: 3, tied: false }];
    next.board!.myEntry = { ...next.board!.myEntry!, rank: 1, tied: false, totalScore: 200, pointsBehindLeader: 0, placeAbove: null };

    act(() => update(next));

    const position = within(screen.getByRole("region", { name: "Your position" }));
    expect(position.getByText("1st")).toBeTruthy();
    expect(position.getByText("Up from 2nd")).toBeTruthy();
    expect(position.getByText("You're in the lead.")).toBeTruthy();
    const rows = within(screen.getByRole("table", { name: "Open rankings" })).getAllByRole("row").slice(1);
    expect(rows[0]).toBe(myRow());
  });

  it("focuses the Climber's row from Show my row", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    fireEvent.click(screen.getByRole("button", { name: "Show my row" }));

    expect(document.activeElement).toBe(myRow());
  });

  it("explains a Climber on the waitlist instead of showing a position", async () => {
    asClimber();
    snapshot.board!.myEntry = null;
    snapshot.board!.myRegistration = { status: "WAITLIST", division: { _id: division, name: "Open" } };
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    expect(screen.getByText("You're on the waitlist, so you're not ranked. You'll appear here if your place is confirmed.")).toBeTruthy();
    expect(screen.getByText("The division you registered for").nextElementSibling?.textContent).toBe("Open");
    expect(screen.getByRole("table", { name: "Open rankings" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Youth" })).toBeNull();
    expect(myRow()).toBeNull();
  });
});

describe("AC-022 the AI Route Assistant's chatbot on the leaderboard", () => {
  function asClimber() {
    snapshot.board = boardFixture("climber");
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  }
  const chat = () => within(screen.getByRole("dialog", { name: "AI Route Assistant" }));

  it("gives a registered Climber the leaderboard's chatbot", async () => {
    asClimber();
    renderPage(`/competitions/${id}/leaderboard`); await ready();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(chat().getByText("Brian Boulder Open, Live leaderboard")).toBeTruthy();
    expect(chat().getByText(/Ask where you stand, or how far another place is\./)).toBeTruthy();
  });

  it("has no chatbot for a Climber who isn't registered, or on the public display", async () => {
    asClimber();
    snapshot.board!.myEntry = null;
    snapshot.board!.myRegistration = null;
    renderPage(`/competitions/${id}/leaderboard`); await ready();
    expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
    cleanup();

    snapshot.board = boardFixture("public");
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(`/leaderboards/${id}`); await ready();
    expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
  });

  it("gives a Gym Admin the competition's chatbot, about the division the page is showing", async () => {
    renderPage(path + "?divisionId=youth"); await ready();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(chat().getByText("Brian Boulder Open, Live leaderboard, Youth division")).toBeTruthy();
    expect(chat().getByText(/Ask how the competition is going behind the standings\./)).toBeTruthy();
  });

  it("asks a Gym Admin's questions about every division while none is chosen", async () => {
    renderPage(); await ready();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(chat().getByText("Brian Boulder Open, Live leaderboard")).toBeTruthy();
  });
});

describe("AC-021 the leaderboard before the competition starts", () => {
  const STARTS_AT = "2026-11-05T15:00:00.000Z";
  const notStarted = () => new ApiError(409, "COMPETITION_NOT_STARTED", "This competition starts on November 5, 2026 at 10:00 a.m. Your scorecard and the leaderboard open then.", undefined, { startsAt: STARTS_AT });
  function asClimber() {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "sam", role: "CLIMBER", token: "fixture", expiresAt: "2040-01-01T00:00:00Z" });
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "sam", email: "sam@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  }
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date("2026-11-05T14:59:58.000Z")); });
  afterEach(() => { vi.useRealTimers(); });
  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

  it("shows a Climber the countdown instead of an error, and no standings", async () => {
    asClimber(); snapshot = { board: null, error: notStarted(), live: "connecting", refreshing: false };
    renderPage(`/competitions/${id}/leaderboard`); await settle(); await settle();
    const panel = screen.getByRole("region", { name: "This competition hasn't started yet" });
    expect(within(panel).getByText(/^The leaderboard opens when the competition starts\./)).toBeTruthy();
    expect(within(panel).getByText(/^Starts/).textContent).toBe("Starts Nov 5, 2026, 10:00 a.m. (Toronto time)");
    expect(within(panel).getByRole("timer").textContent).toContain("2 seconds left");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Loading leaderboard…")).toBeNull();
    expect(reconnect).not.toHaveBeenCalled();
  });
  it("asks for the standings again when the start comes, and shows them without a reload", async () => {
    asClimber(); snapshot = { board: null, error: notStarted(), live: "connecting", refreshing: false };
    renderPage(`/competitions/${id}/leaderboard`); await settle(); await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(reconnect).toHaveBeenCalledTimes(1);
    act(() => update({ board: null, error: notStarted(), live: "connecting", refreshing: true }));
    expect(screen.getByRole("region", { name: "This competition hasn't started yet" })).toBeTruthy();
    expect(screen.queryByText("Loading leaderboard…")).toBeNull();
    act(() => update({ board: boardFixture("climber"), error: null, live: "live", refreshing: false }));
    expect(screen.queryByRole("region", { name: "This competition hasn't started yet" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Brian Boulder Open" })).toBeTruthy();
  });
  it("shows the public the same countdown on the public leaderboard", async () => {
    snapshot = { board: null, error: notStarted(), live: "offline", refreshing: false };
    renderPage(`/leaderboards/${id}`); await settle(); await settle();
    expect(screen.getByRole("region", { name: "This competition hasn't started yet" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Registration status" })).toBeNull();
  });
  it("goes back to the countdown when the start is moved later while the standings are shown", async () => {
    asClimber(); snapshot = { board: boardFixture("climber"), error: null, live: "live", refreshing: false };
    renderPage(`/competitions/${id}/leaderboard`); await settle(); await settle();
    expect(screen.getByRole("heading", { name: "Brian Boulder Open" })).toBeTruthy();
    act(() => update({ board: null, error: notStarted(), live: "offline", refreshing: false }));
    expect(screen.getByRole("region", { name: "This competition hasn't started yet" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
