import {
  PAGE_TOPIC_ROLES,
  PAGE_UPDATE_DELAY_MS,
  PAGE_UPDATE_EVENTS,
  PAGE_UPDATE_NAMES_COMPETITION,
  PAGE_UPDATE_SESSION_CHECK_MS,
} from "../constants/pageUpdates.js";
import { ACCOUNT_ROLES } from "../constants/roles.js";
import { onPageChanged } from "../services/pageUpdateEvents.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { assertStillLoggedIn, errorBody, refusedConnection, viewerFromToken } from "./socketAuth.js";

/**
 * The Socket.IO room of every connection with one role. A connection's role always comes from its
 * access token.
 *
 * @param {string} role One of ROLES.
 * @returns {string} The room's name.
 */
export function roleRoom(role) {
  return `updates:${role}`;
}

/** The changes one role is told about, each once. Only some roles are told which competition changed. */
function changesForRole(role, changes) {
  const named = PAGE_UPDATE_NAMES_COMPETITION.includes(role);
  const seen = new Map();
  for (const { topic, competitionId } of changes) {
    if (!PAGE_TOPIC_ROLES[topic]?.includes(role)) continue;
    const change = named && competitionId ? { topic, competitionId } : { topic };
    seen.set(`${change.topic}:${change.competitionId ?? ""}`, change);
  }
  return [...seen.values()];
}

/**
 * Live page updates over Socket.IO: tells open pages that the data they show has changed, so they
 * reload it themselves and need no refresh button.
 *
 * Connecting: io("<API>/updates", { auth: { token } }) with a logged-in user's access token. A
 * connection without a token, or with an invalid or expired one, is refused with
 * { error, message } in err.data (401 NOT_AUTHENTICATED, TOKEN_EXPIRED or SESSION_EXPIRED), so the
 * page can refresh its token and connect again. A connection hears the changes for its role and
 * sends no events of its own.
 *
 * Server events:
 * - "updates:changed" { changes: [{ topic, competitionId? }] }: what changed since the last one.
 *   It carries no data, only what kind of data changed (PAGE_TOPIC), so the page reads the new data
 *   through the API, which checks again what the user may see. A role only hears the topics its
 *   pages show (PAGE_TOPIC_ROLES). competitionId names the one competition a change is about, for
 *   the roles in PAGE_UPDATE_NAMES_COMPETITION. Changes within delayMs of each other are sent
 *   together, each once.
 * - "updates:closed" { error, message }: the connection's login ended, and it is disconnected.
 *
 * A connection's login session is checked again before a change is sent, at most once every
 * sessionCheckMs. A database problem during that check is logged and the change isn't sent to that
 * connection. A page that reconnects reloads its data, so nothing missed is lost.
 *
 * Rooms are this server process's. Several API processes would need a shared Socket.IO adapter,
 * such as the Redis one.
 *
 * @param {{ namespace: import("socket.io").Namespace, auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, delayMs?: number, sessionCheckMs?: number, now?: () => number }} options
 *   The /updates namespace, the login setup, the wait before changes are sent, how long a login
 *   check is trusted, and the clock (replaced in tests).
 * @returns {{ close: () => void, send: (changes: { topic: string, competitionId?: string }[]) => Promise<void> }}
 *   close stops listening for changes; send announces changes now, for tests.
 */
export function createPageUpdateRealtime({
  namespace,
  auth,
  delayMs = PAGE_UPDATE_DELAY_MS,
  sessionCheckMs = PAGE_UPDATE_SESSION_CHECK_MS,
  now = Date.now,
}) {
  namespace.use(async (socket, next) => {
    try {
      const viewer = await viewerFromToken(socket.handshake?.auth?.token, auth);
      if (!viewer) throw new AppError(401, "NOT_AUTHENTICATED", "Log in to get live updates.");
      if (!ACCOUNT_ROLES.includes(viewer.role)) {
        throw new AppError(403, "ROLE_FORBIDDEN", "Live updates aren't available for this account.");
      }
      socket.data.viewer = viewer;
      socket.data.checkedAt = now();
      next();
    } catch (error) {
      next(refusedConnection(error));
    }
  });

  namespace.on("connection", (socket) => {
    socket.join(roleRoom(socket.data.viewer.role));
  });

  /** Whether a connection may still be told about changes. One whose login ended is closed. */
  async function stillAllowed(socket) {
    if (now() - (socket.data?.checkedAt ?? 0) < sessionCheckMs) return true;
    try {
      await assertStillLoggedIn(socket.data?.viewer ?? null, auth);
      socket.data.checkedAt = now();
      return true;
    } catch (error) {
      if (error instanceof AppError) {
        socket.emit(PAGE_UPDATE_EVENTS.CLOSED, errorBody(error));
        socket.disconnect(true);
      } else {
        logger.error("Page update login check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    }
  }

  async function send(changes) {
    for (const role of ACCOUNT_ROLES) {
      const mine = changesForRole(role, changes);
      if (mine.length === 0) continue;
      const sockets = await namespace.in(roleRoom(role)).fetchSockets();
      for (const socket of sockets) {
        if (await stillAllowed(socket)) socket.emit(PAGE_UPDATE_EVENTS.CHANGED, { changes: mine });
      }
    }
  }

  let waiting = [];
  let timer = null;

  const stopListening = onPageChanged((change) => {
    waiting.push(change);
    if (timer) return;
    timer = setTimeout(() => {
      const changes = waiting;
      waiting = [];
      timer = null;
      send(changes).catch((error) => {
        logger.error("Page update failed", { error: error instanceof Error ? error.message : String(error) });
      });
    }, delayMs);
    timer.unref?.();
  });

  return {
    send,
    close() {
      stopListening();
      clearTimeout(timer);
      timer = null;
      waiting = [];
    },
  };
}
