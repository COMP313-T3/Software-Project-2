import type { SessionTiming } from "./sessionApi.ts";

/** How long before the session ends the warning appears. */
export const WARNING_MS = 2 * 60 * 1000;

/** While the user is active, keep-alives go out at most this often. */
export const KEEP_ALIVE_MS = 5 * 60 * 1000;

/** Checks with the server when a tab comes back go out at most this often. */
export const RECHECK_MS = 30 * 1000;

/** The session is about to end. */
export interface SessionWarning {
  /** When it ends, as a Date.now() time. */
  endsAt: number;
  /** True when staying can't extend it, since it reached its hard limit. */
  limitReached: boolean;
}

/** What tabs tell each other so they share one idle timer. */
export type TimerMessage =
  | { type: "activity"; at: number }
  | {
      type: "extended";
      endsAt: number;
      limitReached: boolean;
      reportedActivity: number;
      sentAt: number;
    };

export interface SessionTimerOptions {
  /** Tells the server how many seconds ago the user was last active. */
  keepAlive: (idleSeconds: number) => Promise<SessionTiming>;
  /** Whether a failed keep-alive means the session is gone. */
  isSessionOver: (error: unknown) => boolean;
  /** Whether the warning may show, which it only does on pages that need a login. */
  canWarn: () => boolean;
  /** Shows the warning, or hides it with null. */
  onWarning: (warning: SessionWarning | null) => void;
  /** Called once when the session runs out. */
  onExpire: () => void;
  /** Tells the other tabs. */
  broadcast: (message: TimerMessage) => void;
}

export type SessionTimer = ReturnType<typeof createSessionTimer>;

/**
 * The idle timer for a login session. The server decides how long a session has left; this keeps
 * a deadline from its answers, measured on this device's clock from when each request was sent,
 * so the two clocks never need to agree. Activity sends a keep-alive at most every 5 minutes.
 * Two minutes before the end it warns, unless there was activity since the last keep-alive, in
 * which case it sends one instead. At the deadline it asks the server once more, since another
 * tab may have kept the session going, and ends it unless the server says otherwise. Timers are
 * checked against the clock whenever they fire, since browsers slow down timers in background tabs.
 *
 * @param options How to reach the server, show the warning, end the session, and talk to other tabs.
 * @returns start and stop; activity for the user's activity in this tab; stay for the warning's
 *   Stay logged in button; recheck for when the tab comes back; pageChanged for when a page that
 *   needs a login opens or closes; and receive for other tabs' messages.
 */
export function createSessionTimer(options: SessionTimerOptions) {
  let running = false;
  let endsAt = 0;
  let limitReached = false;
  let lastActivity = 0;
  let reportedActivity = 0;
  let lastKeepAlive = 0;
  let lastRecheck = 0;
  let warningShown = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | null = null;

  function showWarning() {
    warningShown = true;
    options.onWarning({ endsAt, limitReached });
  }

  function hideWarning() {
    if (!warningShown) return;
    warningShown = false;
    options.onWarning(null);
  }

  function schedule() {
    clearTimeout(timer);
    if (!running) return;
    const now = Date.now();
    const warnAt = endsAt - WARNING_MS;
    const at = warningShown || now >= warnAt ? endsAt : warnAt;
    timer = setTimeout(check, Math.max(0, at - now));
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    hideWarning();
  }

  function expire() {
    if (!running) return;
    stop();
    options.onExpire();
  }

  function setEnd(nextEndsAt: number, nextLimitReached: boolean) {
    endsAt = nextEndsAt;
    limitReached = nextLimitReached;
    if (warningShown) {
      if (endsAt - Date.now() > WARNING_MS) hideWarning();
      else showWarning();
    }
    schedule();
  }

  function announce(sentAt: number) {
    options.broadcast({
      type: "extended",
      endsAt,
      limitReached,
      reportedActivity,
      sentAt,
    });
  }

  /**
   * Sends a keep-alive. At the deadline, any failure ends the session, since there's no telling
   * whether it's still going; before it, only an answer saying the session is gone does.
   */
  function sendKeepAlive(atDeadline = false): Promise<void> {
    if (pending) return pending;
    const sentAt = Date.now();
    reportedActivity = lastActivity;
    lastKeepAlive = sentAt;
    const idleSeconds = Math.max(
      0,
      Math.floor((sentAt - reportedActivity) / 1000),
    );
    pending = options.keepAlive(idleSeconds).then(
      (timing) => {
        pending = null;
        if (!running) return;
        if (timing.expiresIn <= 0) {
          expire();
          return;
        }
        setEnd(sentAt + timing.expiresIn * 1000, timing.limitReached);
        announce(sentAt);
      },
      (error: unknown) => {
        pending = null;
        if (!running) return;
        if (atDeadline || options.isSessionOver(error)) expire();
        else check();
      },
    );
    return pending;
  }

  function check() {
    if (!running) return;
    const now = Date.now();
    if (now >= endsAt) {
      void sendKeepAlive(true);
      return;
    }
    if (now < endsAt - WARNING_MS) {
      schedule();
      return;
    }
    if (!warningShown && !limitReached && lastActivity > reportedActivity) {
      void sendKeepAlive();
      return;
    }
    if (options.canWarn()) showWarning();
    else hideWarning();
    schedule();
  }

  return {
    /**
     * Starts timing a session.
     *
     * @param timing The server's answer about the session.
     * @param sentAt When the request that got it was sent.
     */
    start(timing: SessionTiming, sentAt: number) {
      running = true;
      lastActivity = sentAt;
      reportedActivity = sentAt;
      lastKeepAlive = sentAt;
      hideWarning();
      setEnd(sentAt + timing.expiresIn * 1000, timing.limitReached);
      announce(sentAt);
    },

    stop,

    /**
     * Records the user's activity in this tab. While the warning shows, only its buttons count.
     * In the last minutes without a warning, such as on a page that doesn't need a login, any
     * activity sends a keep-alive right away, unless the session reached its hard limit.
     *
     * @param at When it happened.
     */
    activity(at = Date.now()) {
      if (!running || warningShown || at <= lastActivity) return;
      lastActivity = at;
      const nearTheEnd = !limitReached && at >= endsAt - WARNING_MS;
      if (at - lastKeepAlive >= KEEP_ALIVE_MS || nearTheEnd) {
        void sendKeepAlive();
      }
    },

    /** The warning's Stay logged in button. */
    stay() {
      if (!running) return;
      lastActivity = Date.now();
      void (pending ?? Promise.resolve()).then(() => sendKeepAlive());
    },

    /**
     * Checks the session with the server when the tab comes back into view or the device wakes,
     * reporting the real idle time, so checking never extends the session by itself.
     */
    recheck() {
      if (!running) return;
      const now = Date.now();
      if (now >= endsAt) {
        check();
        return;
      }
      if (now - lastRecheck < RECHECK_MS) return;
      lastRecheck = now;
      void sendKeepAlive();
    },

    /** Shows or hides the warning after a page that needs a login opens or closes. */
    pageChanged() {
      if (running) check();
    },

    /**
     * Applies another tab's activity or keep-alive.
     *
     * @param message The message from the other tab.
     */
    receive(message: TimerMessage) {
      if (!running) return;
      if (message.type === "activity") {
        lastActivity = Math.max(lastActivity, message.at);
        return;
      }
      lastActivity = Math.max(lastActivity, message.reportedActivity);
      reportedActivity = Math.max(reportedActivity, message.reportedActivity);
      lastKeepAlive = Math.max(lastKeepAlive, message.sentAt);
      setEnd(message.endsAt, message.limitReached);
    },
  };
}
