import { io, type Socket } from "socket.io-client";
import { getRealtimeAccessToken } from "./sessionClient.ts";

/** One kind of data that changed, and the competition it's about when the server says which. */
export interface PageChange {
  topic: string;
  competitionId?: string;
}

/**
 * Called with what changed, or with null when changes may have been missed, such as after the
 * connection dropped and came back, so the page reloads whatever it shows.
 */
export type ChangeListener = (changes: PageChange[] | null) => void;

/** The kinds of data a page can show, as the server names them. */
export const PAGE_TOPIC = Object.freeze({
  competitions: "competitions",
  results: "results",
  gyms: "gyms",
  users: "users",
  gymRequests: "gym-requests",
  settings: "settings",
});

export const PAGE_UPDATE_EVENTS = Object.freeze({
  changed: "updates:changed",
  closed: "updates:closed",
});

/** A moment for the next page to start listening before the connection is closed, so moving between pages keeps it. */
const CLOSE_DELAY_MS = 1000;
const RENEWABLE_LOGIN_CODES = new Set(["TOKEN_EXPIRED", "NOT_AUTHENTICATED"]);

let socket: Socket | null = null;
let owner = "";
let connectedBefore = false;
let renewedLogin = false;
let closing: number | undefined;
const listeners = new Set<ChangeListener>();

/**
 * The address of the live page updates. Without VITE_API_BASE_URL it is the page's own origin,
 * which the dev server proxies to the API.
 *
 * @param base The API's base URL, if it is on another origin.
 */
export function updatesSocketUrl(base = import.meta.env.VITE_API_BASE_URL ?? ""): string {
  return (base ? new URL(base, window.location.origin).origin : "") + "/updates";
}

function readChanges(message: unknown): PageChange[] {
  const list = message && typeof message === "object" ? (message as { changes?: unknown }).changes : null;
  if (!Array.isArray(list)) return [];
  const changes: PageChange[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || typeof (item as PageChange).topic !== "string") continue;
    const { topic, competitionId } = item as PageChange;
    changes.push(typeof competitionId === "string" ? { topic, competitionId } : { topic });
  }
  return changes;
}

function refusalCode(data: unknown): string {
  const code = data && typeof data === "object" ? (data as { error?: unknown }).error : null;
  return typeof code === "string" ? code : "";
}

function tell(changes: PageChange[] | null) {
  for (const listener of [...listeners]) {
    try {
      listener(changes);
    } catch {
      continue;
    }
  }
}

function close() {
  window.clearTimeout(closing);
  if (!socket) return;
  const live = socket;
  socket = null;
  owner = "";
  live.removeAllListeners();
  live.disconnect();
}

function open(userId: string) {
  owner = userId;
  connectedBefore = false;
  renewedLogin = false;
  const live = io(updatesSocketUrl(), {
    autoConnect: false,
    forceNew: true,
    withCredentials: true,
    reconnection: true,
    reconnectionDelayMax: 30000,
    timeout: 10000,
    auth: (callback) => {
      getRealtimeAccessToken()
        .then((token) => {
          if (socket === live) callback({ token });
        })
        .catch(() => {
          if (socket === live) close();
        });
    },
  });
  socket = live;

  live.on("connect", () => {
    if (socket !== live) return;
    renewedLogin = false;
    // While the connection was away it heard nothing, so every page reloads once it's back.
    if (connectedBefore) tell(null);
    connectedBefore = true;
  });

  live.on(PAGE_UPDATE_EVENTS.changed, (message: unknown) => {
    if (socket !== live) return;
    const changes = readChanges(message);
    if (changes.length > 0) tell(changes);
  });

  live.on(PAGE_UPDATE_EVENTS.closed, () => {
    if (socket === live) close();
  });

  live.on("connect_error", (error: Error & { data?: unknown }) => {
    if (socket !== live) return;
    const code = refusalCode(error.data);
    // Without a refusal from the server it's the network, and Socket.IO keeps trying by itself.
    if (!code) return;
    if (!RENEWABLE_LOGIN_CODES.has(code) || renewedLogin) {
      close();
      return;
    }
    renewedLogin = true;
    getRealtimeAccessToken(true)
      .then(() => {
        if (socket !== live) return;
        live.disconnect();
        live.connect();
      })
      .catch(() => {
        if (socket === live) close();
      });
  });

  live.connect();
}

/**
 * Follows the live page updates for the logged-in user: the server says what kind of data changed,
 * without the data, and the page reloads what it shows through the API. Every page of the app
 * shares one connection, opened by the first page that listens and closed a moment after the last
 * one stops, so moving between pages keeps it. A connection opened for another user is replaced.
 *
 * An expired access token is renewed once before giving up. When the login ended, the connection
 * stays closed, and pages simply stop updating by themselves.
 *
 * @param userId The logged-in user.
 * @param listener Called with what changed, or null when changes may have been missed.
 * @returns Stops listening.
 */
export function followChanges(userId: string, listener: ChangeListener): () => void {
  window.clearTimeout(closing);
  if (socket && owner !== userId) close();
  listeners.add(listener);
  if (!socket) open(userId);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearTimeout(closing);
    closing = window.setTimeout(() => {
      if (listeners.size === 0) close();
    }, CLOSE_DELAY_MS);
  };
}

/** Closes the connection and forgets every listener. Tests call it between cases. */
export function forgetLiveChanges() {
  listeners.clear();
  close();
}
