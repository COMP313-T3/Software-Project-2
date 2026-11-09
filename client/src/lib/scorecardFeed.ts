import { io, type Socket } from "socket.io-client";
import { ApiError } from "./apiClient.ts";
import { changedRouteIds, checkedScorecard, getScorecard, sameScorecard, type Scorecard } from "./scorecardApi.ts";
import { getRealtimeAccessToken } from "./sessionClient.ts";

export type LiveState = "connecting" | "live" | "reconnecting" | "offline";

export interface ScorecardState {
  scorecard: Scorecard | null;
  error: unknown;
  live: LiveState;
  refreshing: boolean;
  /** Route IDs that the most recent change to the scorecard touched. */
  changed: string[];
}

export const initialScorecardState: ScorecardState = {
  scorecard: null,
  error: null,
  live: "connecting",
  refreshing: true,
  changed: [],
};

export const SCORECARD_EVENTS = Object.freeze({
  join: "scorecard:join",
  leave: "scorecard:leave",
  update: "scorecard:update",
  closed: "scorecard:closed",
});

const JOIN_TIMEOUT_MS = 10000;
const LOGIN_CODES = new Set(["TOKEN_EXPIRED", "NOT_AUTHENTICATED", "SESSION_EXPIRED"]);
const RENEWABLE_LOGIN_CODES = new Set(["TOKEN_EXPIRED", "NOT_AUTHENTICATED"]);
const ACCESS_CODES = new Set(["ROLE_FORBIDDEN", "SCORECARD_FORBIDDEN", "ACCOUNT_INACTIVE"]);
const MISSING_CODES = new Set(["COMPETITION_NOT_FOUND", "REGISTRATION_NOT_FOUND"]);

interface JoinAnswer {
  ok?: boolean;
  scorecard?: unknown;
  error?: unknown;
}

/**
 * The address of the live scorecard namespace. Without VITE_API_BASE_URL it is the page's own
 * origin, which the dev server proxies to the API.
 *
 * @param base The API's base URL, if it is on another origin.
 */
export function scorecardSocketUrl(base = import.meta.env.VITE_API_BASE_URL ?? ""): string {
  return (base ? new URL(base, window.location.origin).origin : "") + "/scorecard";
}

/**
 * Turns a refusal from the live scorecard ({ error, message }) into an ApiError with the status
 * the same refusal would have over HTTP, so the page handles both the same way.
 *
 * @param value The refusal, if there is one.
 */
export function liveProblem(value: unknown): ApiError {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const code = typeof data.error === "string" ? data.error : "LIVE_UNAVAILABLE";
  const message = typeof data.message === "string" && data.message ? data.message : "";
  if (LOGIN_CODES.has(code)) return new ApiError(401, code, "Your login is no longer available. Sign in again.");
  if (ACCESS_CODES.has(code)) return new ApiError(403, code, message || "You no longer have access to this scorecard.");
  if (MISSING_CODES.has(code)) return new ApiError(404, code, message || "This scorecard is no longer available.");
  return new ApiError(0, code, "Live updates are unavailable. Refresh your scorecard or reconnect.");
}

/**
 * Follows the logged-in Climber's scorecard for one competition (US-031): reads it once, then keeps
 * it current over Socket.IO. Every update is a complete scorecard that replaces the one shown, so
 * nothing is ever added twice, and an older one never replaces a newer one.
 *
 * When the scorecard stops being available (the registration was removed, or the login ended) it
 * is cleared, since it is private. An expired access token is renewed once before giving up.
 *
 * @param competitionId The competition.
 * @param onState Called with every new state.
 * @returns refresh reads the scorecard again, reconnect also restarts the live connection, apply
 *   shows the scorecard the API answered after the Climber saved a result, and close stops
 *   everything.
 */
export function followScorecard(competitionId: string, onState: (state: ScorecardState) => void) {
  let active = true;
  let state: ScorecardState = { ...initialScorecardState };
  let socket: Socket | null = null;
  let read: AbortController | null = null;
  let readNumber = 0;
  let connection = 0;
  let renewedLogin = false;

  function patch(next: Partial<ScorecardState>) {
    if (!active) return;
    state = { ...state, ...next };
    onState(state);
  }

  function accept(value: unknown) {
    const scorecard = checkedScorecard(value, competitionId);
    const current = state.scorecard;
    if (current && Date.parse(scorecard.generatedAt) < Date.parse(current.generatedAt)) return;
    if (current && sameScorecard(current, scorecard)) return;
    patch({ scorecard, error: null, changed: current ? changedRouteIds(current, scorecard) : [] });
  }

  function stopSocket() {
    connection += 1;
    if (!socket) return;
    if (socket.connected) socket.emit(SCORECARD_EVENTS.leave, { competitionId });
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  function lose(error: unknown) {
    stopSocket();
    read?.abort();
    patch({ scorecard: null, error, live: "offline", refreshing: false, changed: [] });
  }

  async function load(): Promise<boolean> {
    read?.abort();
    const controller = new AbortController();
    read = controller;
    const number = ++readNumber;
    patch({ refreshing: true });
    try {
      const scorecard = await getScorecard(competitionId, controller.signal);
      if (!active || number !== readNumber) return false;
      accept(scorecard);
      patch({ error: null });
      return true;
    } catch (error) {
      if (!active || controller.signal.aborted || number !== readNumber) return false;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) lose(error);
      else patch({ error });
      return false;
    } finally {
      if (active && number === readNumber && !controller.signal.aborted) patch({ refreshing: false });
    }
  }

  function refused(problem: ApiError) {
    if (problem.status === 401 && RENEWABLE_LOGIN_CODES.has(problem.code) && !renewedLogin) {
      void connectWithRenewedLogin();
      return;
    }
    lose(problem);
  }

  async function connectWithRenewedLogin() {
    renewedLogin = true;
    stopSocket();
    patch({ live: "reconnecting" });
    try {
      await getRealtimeAccessToken(true);
      if (active) connect();
    } catch (error) {
      if (active) lose(error);
    }
  }

  function connect() {
    stopSocket();
    if (!active) return;
    const epoch = connection;
    const current = (): boolean => active && epoch === connection;
    patch({ live: "connecting" });

    const live = io(scorecardSocketUrl(), {
      autoConnect: false,
      forceNew: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: (callback) => {
        getRealtimeAccessToken()
          .then((token) => {
            if (current()) callback({ token });
          })
          .catch((error) => {
            if (current()) lose(error);
          });
      },
    });
    socket = live;

    live.on("connect", () => {
      if (!current()) return;
      patch({ live: "connecting" });
      const joinedOn = live.id;
      live
        .timeout(JOIN_TIMEOUT_MS)
        .emit(SCORECARD_EVENTS.join, { competitionId }, (timedOut: Error | null, answer?: JoinAnswer) => {
          if (!current() || live.id !== joinedOn) return;
          if (timedOut || !answer) {
            patch({ live: "offline", error: liveProblem(null) });
            return;
          }
          if (!answer.ok) {
            refused(liveProblem(answer.error));
            return;
          }
          try {
            accept(answer.scorecard);
            renewedLogin = false;
            patch({ live: "live", error: null });
          } catch (error) {
            patch({ live: "offline", error });
          }
        });
    });

    live.on(SCORECARD_EVENTS.update, (message: { competitionId?: string; scorecard?: unknown } | undefined) => {
      if (!current() || message?.competitionId !== competitionId) return;
      try {
        accept(message.scorecard);
      } catch {
        patch({ live: "offline", error: liveProblem(null) });
      }
    });

    live.on(SCORECARD_EVENTS.closed, (message: { competitionId?: string } | undefined) => {
      if (!current() || message?.competitionId !== competitionId) return;
      refused(liveProblem(message));
    });

    live.on("disconnect", () => {
      if (current()) patch({ live: "reconnecting" });
    });

    live.on("connect_error", (error: Error & { data?: unknown }) => {
      if (!current()) return;
      const problem = liveProblem(error.data);
      if (problem.status === 0) patch({ live: "reconnecting" });
      else refused(problem);
    });

    live.io.on("reconnect_attempt", () => {
      if (current()) patch({ live: "reconnecting" });
    });

    live.io.on("reconnect_failed", () => {
      if (current()) patch({ live: "offline", error: liveProblem(null) });
    });

    live.connect();
  }

  async function start() {
    if ((await load()) && active) {
      renewedLogin = false;
      connect();
    }
  }

  void start();

  return {
    async refresh() {
      if ((await load()) && active && !socket) connect();
    },
    reconnect: start,
    apply(scorecard: Scorecard) {
      if (!active) return;
      accept(scorecard);
      patch({ error: null });
    },
    close() {
      active = false;
      read?.abort();
      stopSocket();
    },
  };
}
