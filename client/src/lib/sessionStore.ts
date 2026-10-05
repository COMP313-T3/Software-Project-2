import type { Role } from "../constants/roles.ts";
import { clearAppStorage } from "./appStorage.ts";
import type { CurrentUser } from "./sessionApi.ts";
import {
  openSessionChannel,
  type SessionChannel,
  type SessionEndReason,
  type SessionMessage,
} from "./sessionChannel.ts";
import {
  endSession,
  endsSession,
  forgetSession,
  isExpiredSession,
  keepAlive,
  resumeSession,
  startSession,
} from "./sessionClient.ts";
import { createSessionTimer, type SessionWarning } from "./sessionTimer.ts";

export type SessionStatus = "checking" | "signedIn" | "signedOut";

export interface SessionUser {
  userId: string;
  email: string;
  role: Role;
}

export interface SessionSnapshot {
  /** "checking" until the app knows whether someone is logged in. */
  status: SessionStatus;
  user: SessionUser | null;
  /** Why the last login ended, or null when none ended since the page loaded. */
  endReason: SessionEndReason | null;
  /** Set while the warning that the session is about to end should show. */
  warning: SessionWarning | null;
}

export type SessionStore = ReturnType<typeof createSessionStore>;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
];
const RECHECK_EVENTS = ["focus", "online", "pageshow"];
const ACTIVITY_THROTTLE_MS = 1000;
const ACTIVITY_SHARE_MS = 15 * 1000;

/**
 * Holds the login state for the whole app: who is logged in, the idle timer and its warning, and
 * the line to the app's other tabs. It changes nothing until connect is called, so React can
 * create it more than once.
 *
 * @returns subscribe and getSnapshot for useSyncExternalStore; connect, which picks up an
 *   existing login and returns a function that disconnects; logIn and logOut; stay, for the
 *   warning's Stay logged in button; and watchProtectedPage, for pages that need a login.
 */
export function createSessionStore() {
  let snapshot: SessionSnapshot = {
    status: "checking",
    user: null,
    endReason: null,
    warning: null,
  };
  const listeners = new Set<() => void>();
  let channel: SessionChannel | null = null;
  let connected = false;
  let watching = false;
  let attempt = 0;
  let protectedPages = 0;
  let lastActivityEvent = 0;
  let lastActivityShared = 0;

  const timer = createSessionTimer({
    keepAlive,
    isSessionOver: endsSession,
    canWarn: () => protectedPages > 0,
    onWarning: (warning) => update({ warning }),
    onExpire: expire,
    broadcast: (message) => channel?.post(message),
  });

  function update(changes: Partial<SessionSnapshot>) {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) listener();
  }

  function onActivity() {
    const now = Date.now();
    if (now - lastActivityEvent < ACTIVITY_THROTTLE_MS) return;
    lastActivityEvent = now;
    timer.activity(now);
    if (now - lastActivityShared >= ACTIVITY_SHARE_MS) {
      lastActivityShared = now;
      channel?.post({ type: "activity", at: now });
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") timer.recheck();
  }

  function recheck() {
    timer.recheck();
  }

  function watchActivity(on: boolean) {
    if (on === watching) return;
    watching = on;
    for (const type of ACTIVITY_EVENTS) {
      if (on) {
        window.addEventListener(type, onActivity, {
          capture: true,
          passive: true,
        });
      } else {
        window.removeEventListener(type, onActivity, { capture: true });
      }
    }
    for (const type of RECHECK_EVENTS) {
      if (on) window.addEventListener(type, recheck);
      else window.removeEventListener(type, recheck);
    }
    if (on) document.addEventListener("visibilitychange", onVisibilityChange);
    else document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function signIn(user: CurrentUser, sentAt: number) {
    update({
      status: "signedIn",
      user: { userId: user.userId, email: user.email, role: user.role },
      endReason: null,
      warning: null,
    });
    timer.start(user.session, sentAt);
    watchActivity(true);
  }

  function signOut(endReason: SessionEndReason | null) {
    attempt += 1;
    timer.stop();
    watchActivity(false);
    forgetSession();
    if (endReason) clearAppStorage();
    update({ status: "signedOut", user: null, endReason, warning: null });
  }

  function expire() {
    endSession().catch(() => undefined);
    signOut("expired");
    channel?.post({ type: "ended", reason: "expired" });
  }

  async function resume() {
    attempt += 1;
    const run = attempt;
    const sentAt = Date.now();
    try {
      const user = await resumeSession();
      if (!connected || run !== attempt) return;
      if (user) signIn(user, sentAt);
      else signOut(null);
    } catch (error) {
      if (connected && run === attempt) {
        signOut(isExpiredSession(error) ? "expired" : null);
      }
    }
  }

  function receive(message: SessionMessage) {
    switch (message.type) {
      case "activity":
      case "extended":
        timer.receive(message);
        break;
      case "started":
        if (snapshot.status !== "signedIn") void resume();
        break;
      case "ended":
        if (snapshot.status !== "signedOut") signOut(message.reason);
        break;
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,

    connect() {
      connected = true;
      channel = openSessionChannel(receive);
      void resume();
      return () => {
        connected = false;
        attempt += 1;
        timer.stop();
        watchActivity(false);
        channel?.close();
        channel = null;
      };
    },

    /**
     * Logs in, then tells the other tabs.
     *
     * @throws {ApiError} With a message for the form, such as "Email or password is incorrect."
     */
    async logIn(email: string, password: string) {
      attempt += 1;
      const run = attempt;
      const sentAt = Date.now();
      try {
        const user = await startSession(email, password);
        if (run !== attempt) return;
        signIn(user, sentAt);
        channel?.post({ type: "started" });
      } catch (error) {
        if (run === attempt && snapshot.status === "checking") {
          update({ status: "signedOut" });
        }
        throw error;
      }
    },

    /**
     * Logs out everywhere in this browser: the server deletes the login cookies, and the other
     * tabs log out too.
     *
     * @throws {ApiError} When the API can't be reached, so the login is still there.
     */
    async logOut() {
      await endSession();
      signOut("loggedOut");
      channel?.post({ type: "ended", reason: "loggedOut" });
    },

    stay() {
      timer.stay();
    },

    /**
     * Marks a page that needs a login as open, which lets the warning show.
     *
     * @returns A function to call when the page closes.
     */
    watchProtectedPage() {
      protectedPages += 1;
      timer.pageChanged();
      return () => {
        protectedPages -= 1;
        timer.pageChanged();
      };
    },
  };
}
