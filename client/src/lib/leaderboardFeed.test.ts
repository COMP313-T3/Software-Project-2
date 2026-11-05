import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { io } from "socket.io-client";
import { ApiError } from "./apiClient.ts";
import { getLeaderboard, type Leaderboard } from "./leaderboardApi.ts";
import { getRealtimeAccessToken } from "./sessionClient.ts";
import { followLeaderboard, leaderboardSocketUrl, type LeaderboardState } from "./leaderboardFeed.ts";
import { boardFixture, BOARD_COMPETITION as id } from "../test/leaderboardFixtures.ts";
vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("./leaderboardApi.ts", async original => ({ ...await original<typeof import("./leaderboardApi.ts")>(), getLeaderboard: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ getRealtimeAccessToken: vi.fn() }));
type Handler = (...args: unknown[]) => void;
class Events {
  handlers = new Map<string, Handler>();
  on(event: string, fn: Handler) { this.handlers.set(event, fn); return this; }
  receive(event: string, ...args: unknown[]) { this.handlers.get(event)?.(...args); }
  removeAllListeners() { this.handlers.clear(); }
}
class FakeSocket extends Events {
  io = new Events(); connected = false; id = "connection-1"; outgoing: { event: string; payload: unknown }[] = [];
  options: { auth: (callback: (value: unknown) => void) => void };
  nextAck: unknown = { ok: true, leaderboard: boardFixture() }; held: Handler | null = null; holdJoin = false;
  credentials: unknown = null;
  constructor(options: FakeSocket["options"]) { super(); this.options = options; }
  connect() { this.options.auth(auth => { this.credentials = auth; this.connected = true; this.receive("connect"); }); return this; }
  disconnect() { this.connected = false; return this; }
  emit(event: string, payload: unknown) { this.outgoing.push({ event, payload }); return this; }
  timeout() { return { emit: (event: string, payload: unknown, callback: Handler) => { this.emit(event, payload); if (this.holdJoin) this.held = callback; else callback(null, this.nextAck); } }; }
}
const feeds: ReturnType<typeof followLeaderboard>[] = []; let sockets: FakeSocket[], states: LeaderboardState[];
const state = () => states.at(-1)!;
const later = (score = 240, time = "2026-11-05T12:02:00.000Z") => { const b = boardFixture(); b.generatedAt = time; b.divisions[0].standings[0].totalScore = score; return b; };
function begin(audience: "manage" | "climber" | "public" = "manage") { const feed = followLeaderboard(id, audience, value => states.push(value)); feeds.push(feed); return feed; }
async function ready() { await waitFor(() => expect(state()?.live).toBe("live")); return sockets.at(-1)!; }
beforeEach(() => {
  sockets = []; states = [];
  vi.mocked(getLeaderboard).mockReset().mockResolvedValue(boardFixture()); vi.mocked(getRealtimeAccessToken).mockReset().mockResolvedValue("memory-token");
  vi.mocked(io).mockReset().mockImplementation(((_url: string, options: FakeSocket["options"]) => { const s = new FakeSocket(options); sockets.push(s); return s; }) as never);
});
afterEach(() => { feeds.splice(0).forEach(feed => feed.close()); vi.restoreAllMocks(); });
describe("US-020 authoritative Socket.IO subscriptions", () => {
  it("reads before connecting, authenticates in memory, and joins exactly the chosen competition", async () => {
    begin(); const s = await ready(); expect(getLeaderboard).toHaveBeenCalledWith(id, "manage", expect.any(AbortSignal));
    expect(vi.mocked(io).mock.calls[0][0]).toBe("/leaderboard"); expect(s.credentials).toEqual({ token: "memory-token" });
    expect(s.outgoing).toEqual([{ event: "leaderboard:join", payload: { competitionId: id } }]);
  });
  it("connects public displays without requesting or sending a login token", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue(boardFixture("public"));
    vi.mocked(io).mockImplementation(((_url: string, options: FakeSocket["options"]) => { const s = new FakeSocket(options); s.nextAck = { ok: true, leaderboard: boardFixture("public") }; sockets.push(s); return s; }) as never);
    begin("public"); const s = await ready(); expect(s.credentials).toEqual({}); expect(getRealtimeAccessToken).not.toHaveBeenCalled();
  });
  it("replaces snapshots, ignores exact duplicates/older messages and never appends rows", async () => {
    begin(); const s = await ready(), board = later(); s.receive("leaderboard:update", { competitionId: id, leaderboard: board });
    const count = states.length; s.receive("leaderboard:update", { competitionId: id, leaderboard: board }); s.receive("leaderboard:update", { competitionId: id, leaderboard: boardFixture() });
    expect(states).toHaveLength(count); expect(state().board?.divisions[0].standings).toHaveLength(3); expect(state().board?.divisions[0].standings[0].totalScore).toBe(240);
  });
  it("supports the backend's public fallback for an unregistered Climber without accepting it for management", async () => {
    const board = boardFixture("climber"); board.myEntry = null; vi.mocked(getLeaderboard).mockResolvedValueOnce(board);
    vi.mocked(io).mockImplementation(((_url: string, options: FakeSocket["options"]) => { const s = new FakeSocket(options); s.nextAck = { ok: true, leaderboard: boardFixture("public") }; sockets.push(s); return s; }) as never);
    begin("climber"); await ready(); expect(state().board?.audience).toBe("public");
    const managed = begin(); await waitFor(() => expect(sockets).toHaveLength(2)); await waitFor(() => expect(state().live).toBe("offline")); expect(state().board?.audience).toBe("manage"); managed.close();
  });
  it("ignores events for another competition", async () => {
    begin(); const s = await ready(), count = states.length; s.receive("leaderboard:update", { competitionId: "foreign", leaderboard: later() }); s.receive("leaderboard:closed", { competitionId: "foreign" });
    expect(states).toHaveLength(count); expect(state().live).toBe("live");
  });
  it("retains a newer update received before the join acknowledgement", async () => {
    vi.mocked(io).mockImplementation(((_url: string, options: FakeSocket["options"]) => { const s = new FakeSocket(options); s.holdJoin = true; sockets.push(s); return s; }) as never);
    begin(); await waitFor(() => expect(sockets[0]?.held).toBeTypeOf("function")); const s = sockets[0];
    s.receive("leaderboard:update", { competitionId: id, leaderboard: later() }); s.held!(null, { ok: true, leaderboard: boardFixture() });
    expect(state().board?.divisions[0].standings[0].totalScore).toBe(240); expect(state().live).toBe("live");
  });
  it("keeps the last snapshot on disconnect and rejoins with current standings", async () => {
    begin(); const s = await ready(); s.connected = false; s.receive("disconnect", "transport close");
    expect(state().live).toBe("reconnecting"); expect(state().board).not.toBeNull();
    s.id = "connection-2"; s.nextAck = { ok: true, leaderboard: later() }; s.connect(); await ready();
    expect(s.outgoing.filter(e => e.event === "leaderboard:join")).toHaveLength(2); expect(state().board?.generatedAt).toBe(later().generatedAt);
  });
  it("ignores a late acknowledgement from the previous connection", async () => {
    begin(); const s = await ready(); s.holdJoin = true; s.receive("connect"); const old = s.held!;
    s.connected = false; s.receive("disconnect"); s.id = "new-connection"; s.nextAck = { ok: true, leaderboard: later() }; s.holdJoin = false; s.connect(); await ready(); old(null, { ok: true, leaderboard: boardFixture() });
    expect(state().board?.generatedAt).toBe(later().generatedAt);
  });
  it("keeps manual reads usable after live retries stop", async () => {
    const feed = begin(), s = await ready(); s.io.receive("reconnect_failed"); expect(state().live).toBe("offline");
    vi.mocked(getLeaderboard).mockResolvedValueOnce(later()); await feed.refresh(); expect(state().board?.generatedAt).toBe(later().generatedAt); expect(state().live).toBe("offline");
    await feed.reconnect(); await ready(); expect(sockets).toHaveLength(2);
  });
  it("clears stale private content after access is revoked, without falling back to public", async () => {
    begin(); const s = await ready(); s.receive("leaderboard:closed", { competitionId: id, error: "LEADERBOARD_ACCESS_LOST", message: "private stack" });
    expect(state().board).toBeNull(); expect(state().live).toBe("offline"); expect(String(state().error)).not.toContain("private stack"); expect(s.connected).toBe(false);
  });
  it("refreshes an expired token once and rejoins without a browser reload", async () => {
    begin(); const s = await ready(); s.receive("connect_error", Object.assign(new Error("denied"), { data: { error: "TOKEN_EXPIRED" } }));
    await waitFor(() => expect(getRealtimeAccessToken).toHaveBeenCalledWith(true)); await ready(); expect(s.outgoing.filter(e => e.event === "leaderboard:join")).toHaveLength(2);
  });
  it("stops on a failed authentication refresh", async () => {
    begin(); const s = await ready(); vi.mocked(getRealtimeAccessToken).mockRejectedValueOnce(new ApiError(401, "SESSION_EXPIRED", "Sign in again."));
    s.receive("connect_error", Object.assign(new Error("expired"), { data: { error: "TOKEN_EXPIRED" } }));
    await waitFor(() => expect(state().board).toBeNull()); expect(s.connected).toBe(false);
  });
  it.each([401, 403, 404])("clears the table after a denied REST refresh (%s)", async status => {
    const feed = begin(); await ready(); vi.mocked(getLeaderboard).mockRejectedValueOnce(new ApiError(status, "ACCESS_DENIED", "Unavailable")); await feed.refresh();
    expect(state().board).toBeNull(); expect(sockets[0].connected).toBe(false);
  });
  it("does not connect after an initial API denial", async () => {
    vi.mocked(getLeaderboard).mockRejectedValueOnce(new ApiError(403, "ACCESS_DENIED", "Unavailable")); begin();
    await waitFor(() => expect(state()?.refreshing).toBe(false)); expect(io).not.toHaveBeenCalled();
  });
  it("retains loaded rows on a network read failure", async () => {
    const feed = begin(); await ready(); vi.mocked(getLeaderboard).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Offline")); await feed.refresh();
    expect(state().board).not.toBeNull(); expect(state().error).toBeInstanceOf(ApiError);
  });
  it("aborts reads, leaves the room and releases listeners on navigation", async () => {
    const feed = begin(), s = await ready(), signal = vi.mocked(getLeaderboard).mock.calls[0][2]; feed.close(); const count = states.length;
    s.receive("leaderboard:update", { competitionId: id, leaderboard: later() }); expect(states).toHaveLength(count); expect(signal?.aborted).toBe(true);
    expect(s.outgoing.at(-1)).toEqual({ event: "leaderboard:leave", payload: { competitionId: id } }); expect(s.handlers.size).toBe(0); expect(s.io.handlers.size).toBe(0); expect(s.connected).toBe(false);
  });
  it("does not open a socket for an initial read resolved after unmount", async () => {
    let resolve!: (v: Leaderboard) => void; vi.mocked(getLeaderboard).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const feed = begin(); feed.close(); resolve(boardFixture()); await Promise.resolve(); await Promise.resolve(); expect(io).not.toHaveBeenCalled();
  });
  it("uses the API origin for a separately hosted Socket.IO server", () => { expect(leaderboardSocketUrl("https://api.example.com/")).toBe("https://api.example.com/leaderboard"); });
});
