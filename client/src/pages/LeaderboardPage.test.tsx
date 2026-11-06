import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { followLeaderboard, initialLeaderboardState, type LeaderboardState } from "../lib/leaderboardFeed.ts";
import { ApiError } from "../lib/apiClient.ts";
import * as sessionApi from "../lib/sessionApi.ts";
import { boardFixture, BOARD_COMPETITION as id, BOARD_DIVISION as division } from "../test/leaderboardFixtures.ts";
vi.mock("../lib/leaderboardFeed.ts", async original => ({ ...await original<typeof import("../lib/leaderboardFeed.ts")>(), followLeaderboard: vi.fn() }));
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
