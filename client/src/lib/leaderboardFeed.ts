import { io, type Socket } from "socket.io-client";
import { ApiError } from "./apiClient.ts";
import { notStartedProblem } from "./competitionStart.ts";
import { checkedLeaderboard, getLeaderboard, type Leaderboard, type LeaderboardAudience } from "./leaderboardApi.ts";
import { getRealtimeAccessToken } from "./sessionClient.ts";

export type LiveState = "connecting" | "live" | "reconnecting" | "offline";
export interface LeaderboardState { board: Leaderboard | null; error: unknown; live: LiveState; refreshing: boolean }
export const initialLeaderboardState: LeaderboardState = { board: null, error: null, live: "connecting", refreshing: true };
const AUTH_ERRORS = new Set(["TOKEN_EXPIRED", "NOT_AUTHENTICATED"]);
const ACCESS_ERRORS = new Set(["LEADERBOARD_NOT_PUBLIC", "COMPETITION_NOT_FOUND", "REGISTRATION_NOT_FOUND", "LEADERBOARD_ACCESS_LOST", "ACCOUNT_INACTIVE", "SESSION_EXPIRED"]);
export function leaderboardSocketUrl(base = import.meta.env.VITE_API_BASE_URL ?? "") {
  return (base ? new URL(base, window.location.origin).origin : "") + "/leaderboard";
}
function socketError(value: unknown): ApiError {
  // A competition that hasn't started keeps its start, so the page can count down to it.
  const notStarted = notStartedProblem(value);
  if (notStarted) return notStarted;
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const code = typeof data.error === "string" ? data.error : "LIVE_UNAVAILABLE";
  const status = AUTH_ERRORS.has(code) || code === "SESSION_EXPIRED" ? 401 : ACCESS_ERRORS.has(code) ? 403 : 0;
  const message = code === "LEADERBOARD_NOT_PUBLIC" ? "This competition's public leaderboard is unavailable." : status === 401 ? "Your login is no longer available. Sign in again." : status === 403 ? "You no longer have access to this leaderboard." : "Live updates are unavailable. Reconnect to keep the standings up to date.";
  return new ApiError(status, code, message);
}

/** One competition/audience per connection. Every message is a complete authoritative snapshot. */
export function followLeaderboard(competitionId: string, audience: LeaderboardAudience, onState: (state: LeaderboardState) => void) {
  let active = true, state = { ...initialLeaderboardState }, socket: Socket | null = null;
  let read: AbortController | null = null, connection = 0, joined = false, refreshedAuth = false, readNumber = 0;
  let duringJoin: Leaderboard | null = null;
  // The backend permits an unregistered Climber to view an enabled public board. Its REST
  // response is a Climber view with myEntry:null; its socket correctly joins the public room.
  function checkedSnapshot(value: unknown) {
    const publicClimber = audience === "climber" && value !== null && typeof value === "object" && "audience" in value && value.audience === "public";
    return checkedLeaderboard(value, competitionId, publicClimber ? "public" : audience);
  }
  const patch = (next: Partial<LeaderboardState>) => { if (active) { state = { ...state, ...next }; onState(state); } };
  function accept(value: unknown) {
    const board = checkedSnapshot(value);
    if (state.board && Date.parse(board.generatedAt) < Date.parse(state.board.generatedAt)) return;
    if (JSON.stringify(board) !== JSON.stringify(state.board)) patch({ board, error: null });
  }
  function stopSocket() {
    connection += 1; joined = false; duringJoin = null;
    if (socket) { if (socket.connected) socket.emit("leaderboard:leave", { competitionId }); socket.removeAllListeners(); socket.io.removeAllListeners(); socket.disconnect(); socket = null; }
  }
  function denied(error: unknown) { stopSocket(); read?.abort(); patch({ board: null, error, live: "offline", refreshing: false }); }
  async function refresh() {
    read?.abort(); const controller = new AbortController(); read = controller; const number = ++readNumber;
    patch({ refreshing: true });
    try {
      const board = await getLeaderboard(competitionId, audience, controller.signal);
      if (active && !controller.signal.aborted && number === readNumber) { accept(board); patch({ error: null }); return true; }
    } catch (error) {
      if (!active || controller.signal.aborted || number !== readNumber) return false;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) denied(error);
      else patch({ error });
    } finally { if (!controller.signal.aborted && number === readNumber) patch({ refreshing: false }); }
    return false;
  }
  function openSocket() {
    stopSocket(); if (!active) return;
    const epoch = connection; patch({ live: "connecting" });
    const current = io(leaderboardSocketUrl(), {
      autoConnect: false, forceNew: true, withCredentials: true,
      reconnection: true, reconnectionAttempts: 5, reconnectionDelayMax: 5000, timeout: 10000,
      auth: callback => {
        if (audience === "public") { callback({}); return; }
        getRealtimeAccessToken().then(token => { if (active && epoch === connection) callback({ token }); }).catch(error => { if (active && epoch === connection) denied(error); });
      },
    });
    socket = current;
    const valid = () => active && epoch === connection;
    async function repairAuth(error: ApiError) {
      if (audience === "public" || refreshedAuth || !AUTH_ERRORS.has(error.code)) { denied(error); return; }
      refreshedAuth = true; joined = false; patch({ board: null, live: "reconnecting" });
      try { await getRealtimeAccessToken(true); if (valid()) { current.disconnect(); current.connect(); } }
      catch (failure) { if (valid()) denied(failure); }
    }
    current.on("connect", () => {
      if (!valid()) return; joined = false; duringJoin = null; const joinConnection = current.id;
      patch({ live: "connecting" });
      current.timeout(10000).emit("leaderboard:join", { competitionId }, (timeout: Error | null, answer: { ok?: boolean; leaderboard?: unknown; error?: unknown } | undefined) => {
        if (!valid() || !current.connected || current.id !== joinConnection) return;
        if (timeout || !answer) { patch({ live: "offline", error: socketError(null) }); return; }
        if (!answer.ok) { const error = socketError(answer.error); if (error.status === 401) void repairAuth(error); else if (error.status === 403 || error.status === 409) denied(error); else patch({ live: "offline", error }); return; }
        try { accept(answer.leaderboard); if (duringJoin) accept(duringJoin); duringJoin = null; joined = true; refreshedAuth = false; patch({ live: "live", error: null }); }
        catch (error) { patch({ live: "offline", error }); }
      });
    });
    current.on("leaderboard:update", (message: { competitionId?: string; leaderboard?: unknown }) => {
      if (!valid() || message?.competitionId !== competitionId) return;
      try { if (joined) accept(message.leaderboard); else { const board = checkedSnapshot(message.leaderboard); if (!duringJoin || Date.parse(board.generatedAt) >= Date.parse(duringJoin.generatedAt)) duringJoin = board; } }
      catch { patch({ live: "offline", error: socketError(null) }); }
    });
    current.on("leaderboard:closed", (message: { competitionId?: string }) => {
      if (!valid() || message?.competitionId !== competitionId) return;
      const error = socketError(message); if (error.status === 401) void repairAuth(error); else denied(error);
    });
    current.on("disconnect", () => { if (valid()) { joined = false; duringJoin = null; patch({ live: "reconnecting" }); } });
    current.on("connect_error", (error: Error & { data?: unknown }) => {
      if (!valid()) return; joined = false; const problem = socketError(error.data);
      if (problem.status === 401) void repairAuth(problem);
      else if (problem.status === 403) denied(problem);
      else patch({ live: "reconnecting", error: problem });
    });
    current.io.on("reconnect_failed", () => { if (valid()) patch({ live: "offline", error: socketError(null) }); });
    current.io.on("reconnect_attempt", () => { if (valid()) patch({ live: "reconnecting" }); });
    current.connect();
  }
  async function reconnect() { if (await refresh() && active) { refreshedAuth = false; openSocket(); } }
  void reconnect();
  return { refresh: async () => { const loaded = await refresh(); if (loaded && !socket && active) openSocket(); }, reconnect, close() { active = false; read?.abort(); stopSocket(); } };
}
