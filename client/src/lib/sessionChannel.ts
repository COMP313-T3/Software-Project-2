import type { TimerMessage } from "./sessionTimer.ts";

/** Why a login ended. */
export type SessionEndReason = "expired" | "loggedOut";

/** What tabs tell each other about the login. */
export type SessionMessage =
  | TimerMessage
  | { type: "started" }
  | { type: "ended"; reason: SessionEndReason };

export interface SessionChannel {
  post: (message: SessionMessage) => void;
  close: () => void;
}

const CHANNEL_NAME = "topsend-session";
const STORAGE_KEY = "topsend.session-message";
const MESSAGE_TYPES = new Set(["activity", "extended", "started", "ended"]);

function isSessionMessage(value: unknown): value is SessionMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    MESSAGE_TYPES.has(String(value.type))
  );
}

function storageChannel(
  onMessage: (message: SessionMessage) => void,
): SessionChannel {
  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    let message: unknown;
    try {
      message = JSON.parse(event.newValue);
    } catch {
      return;
    }
    if (isSessionMessage(message)) onMessage(message);
  }

  window.addEventListener("storage", onStorage);
  return {
    post(message) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        return;
      }
    },
    close() {
      window.removeEventListener("storage", onStorage);
    },
  };
}

/**
 * Opens the line between this app's tabs, so activity, keep-alives, logging in, and logging out
 * reach every tab. Uses BroadcastChannel, or storage events in browsers without it.
 *
 * @param onMessage Called with each message from another tab.
 * @returns post, to tell the other tabs, and close.
 */
export function openSessionChannel(
  onMessage: (message: SessionMessage) => void,
): SessionChannel {
  if (typeof BroadcastChannel !== "function") return storageChannel(onMessage);

  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (isSessionMessage(event.data)) onMessage(event.data);
  };
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
