import {
  LEADERBOARD_AUDIENCE,
  LEADERBOARD_EVENTS,
  LEADERBOARD_MAX_ROOMS_PER_CONNECTION,
  LEADERBOARD_RETRY_DELAY_MS,
  LEADERBOARD_UPDATE_DELAY_MS,
  LEADERBOARD_UPDATE_RETRIES,
} from "../constants/leaderboard.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";
import { onLeaderboardChanged } from "../services/leaderboardEvents.js";
import * as leaderboardService from "../services/leaderboardService.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import {
  assertStillLoggedIn,
  errorBody,
  refusedConnection,
  viewerFromToken,
} from "./socketAuth.js";

const AUDIENCES = Object.values(LEADERBOARD_AUDIENCE);

/**
 * The Socket.IO room for one audience of one competition's leaderboard. A connection only joins a
 * room after leaderboardAccess allowed it, and every update goes to one competition's rooms only,
 * so nobody receives another competition's standings.
 *
 * @param {string} competitionId The competition.
 * @param {string} audience One of LEADERBOARD_AUDIENCE.
 * @returns {string} The room's name.
 */
export function roomFor(competitionId, audience) {
  return `leaderboard:${competitionId}:${audience}`;
}

function replyWith(ack) {
  return typeof ack === "function" ? ack : () => {};
}

function competitionIdFrom(payload) {
  const parsed = competitionIdParamsSchema.safeParse({ competitionId: payload?.competitionId });
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid competition id.", {
      competitionId: "Invalid competition id.",
    });
  }
  return parsed.data.competitionId;
}

/**
 * Live leaderboards over Socket.IO (US-020 criterion 3, AC-016).
 *
 * Connecting: io("<API>/leaderboard", { auth: { token } }), with the access token of a logged-in
 * Gym Admin or Climber, or with no token for a public leaderboard. An invalid or expired token
 * refuses the connection with { error, message } in err.data, so the page can refresh its token and
 * connect again.
 *
 * Client events, each with an acknowledgement callback:
 * - "leaderboard:join" { competitionId }: starts following a competition. The acknowledgement is
 *   { ok: true, leaderboard } with the current standings, shaped like the REST routes' answer for
 *   this viewer, or { ok: false, error } with the same errors (404, 403 LEADERBOARD_NOT_PUBLIC).
 * - "leaderboard:leave" { competitionId }: stops following it.
 *
 * Server events:
 * - "leaderboard:update" { competitionId, reason, leaderboard }: new standings after an official
 *   result, the scoring, a problem's points, a registration, or the competition changed. Bursts of
 *   changes within LEADERBOARD_UPDATE_DELAY_MS send one update. When the standings can't be
 *   calculated, the update is tried again after LEADERBOARD_RETRY_DELAY_MS, up to
 *   LEADERBOARD_UPDATE_RETRIES times.
 * - "leaderboard:closed" { competitionId, error, message }: the leaderboard stopped being available
 *   to this connection, such as when public access was turned off. The connection stops following
 *   it.
 *
 * A disconnect needs no clean-up: Socket.IO removes the connection from its rooms.
 *
 * @param {{ namespace: import("socket.io").Namespace, auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, delayMs?: number, retryDelayMs?: number, service?: { calculateLeaderboard: Function, leaderboardAccess: Function, presentLeaderboard: Function } }} options
 *   The /leaderboard namespace, the login setup, the wait before an update, the wait before trying
 *   a failed update again, and the leaderboard functions (replaced in tests).
 * @returns {{ close: () => void, sendUpdate: (competitionId: string, reason?: string) => Promise<void> }}
 *   close stops listening for changes; sendUpdate sends an update now, for tests.
 */
export function createLeaderboardRealtime({
  namespace,
  auth,
  delayMs = LEADERBOARD_UPDATE_DELAY_MS,
  retryDelayMs = LEADERBOARD_RETRY_DELAY_MS,
  service = leaderboardService,
}) {
  const { calculateLeaderboard, leaderboardAccess, presentLeaderboard } = service;

  // The token is checked once, here. Later checks use the login session it named, since the token
  // itself runs out after 15 minutes while the connection stays open (see socketAuth.js).
  namespace.use(async (socket, next) => {
    try {
      socket.data.viewer = await viewerFromToken(socket.handshake?.auth?.token, auth);
      next();
    } catch (error) {
      next(refusedConnection(error));
    }
  });

  namespace.on("connection", (socket) => {
    const following = new Set();
    const viewer = socket.data.viewer ?? null;
    logger.info("Leaderboard connection opened", {
      socketId: socket.id,
      role: viewer?.role ?? "VISITOR",
    });

    socket.on(LEADERBOARD_EVENTS.JOIN, async (payload, ack) => {
      const reply = replyWith(ack);
      try {
        const competitionId = competitionIdFrom(payload);
        if (!following.has(competitionId) && following.size >= LEADERBOARD_MAX_ROOMS_PER_CONNECTION) {
          throw new AppError(
            429,
            "TOO_MANY_LEADERBOARDS",
            `One connection can follow up to ${LEADERBOARD_MAX_ROOMS_PER_CONNECTION} leaderboards. Leave one first.`,
          );
        }
        await assertStillLoggedIn(viewer, auth);
        const access = await leaderboardAccess(viewer, competitionId);
        const calculated = await calculateLeaderboard(competitionId);
        if (!calculated) throw new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");

        // One audience per competition, so a viewer whose access changed doesn't get two views.
        for (const audience of AUDIENCES) socket.leave(roomFor(competitionId, audience));
        socket.join(roomFor(competitionId, access.audience));
        following.add(competitionId);
        reply({ ok: true, leaderboard: presentLeaderboard(calculated.board, access) });
      } catch (error) {
        if (!(error instanceof AppError)) {
          logger.error("Leaderboard join failed", {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        reply({ ok: false, error: errorBody(error) });
      }
    });

    socket.on(LEADERBOARD_EVENTS.LEAVE, (payload, ack) => {
      const reply = replyWith(ack);
      try {
        const competitionId = competitionIdFrom(payload);
        for (const audience of AUDIENCES) socket.leave(roomFor(competitionId, audience));
        following.delete(competitionId);
        reply({ ok: true });
      } catch (error) {
        reply({ ok: false, error: errorBody(error) });
      }
    });

    socket.on("disconnect", (reason) => {
      following.clear();
      logger.info("Leaderboard connection closed", { socketId: socket.id, reason });
    });
  });

  function roomSize(room) {
    return namespace.adapter?.rooms?.get(room)?.size ?? 0;
  }

  function closeRoom(competitionId, audience, error) {
    const room = roomFor(competitionId, audience);
    if (roomSize(room) === 0) return;
    namespace.to(room).emit(LEADERBOARD_EVENTS.CLOSED, { competitionId, ...errorBody(error) });
    namespace.in(room).socketsLeave(room);
  }

  /**
   * Recalculates a competition's standings once and sends them to everyone following it, each in
   * their own audience's view. Nothing is calculated when nobody is following.
   *
   * Room membership alone isn't authorization: a login, gym assignment, registration, or public
   * access may have changed since joining, so each viewer's access is decided again. The login is
   * checked through its session, never the access token, which runs out after 15 minutes. All
   * Visitors share one check, as do several connections of the same login. A viewer whose access
   * changed moves to their new view, such as a Climber who registered while watching the public
   * leaderboard. One who lost it (an AppError) gets "leaderboard:closed". A database problem only
   * skips this update for them; they keep following.
   */
  async function sendUpdate(competitionId, reason) {
    const rooms = AUDIENCES.map((audience) => roomFor(competitionId, audience));
    if (!rooms.some((room) => roomSize(room) > 0)) return;

    const calculated = await calculateLeaderboard(competitionId);
    if (!calculated) {
      const gone = new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
      for (const audience of AUDIENCES) closeRoom(competitionId, audience, gone);
      return;
    }
    const { board } = calculated;
    const update = (leaderboard) => ({ competitionId, reason, leaderboard });

    const checks = new Map();
    const accessOf = (viewer) => {
      const key = viewer ? `${viewer.userId}:${viewer.sessionId}` : "visitor";
      if (!checks.has(key)) {
        checks.set(
          key,
          (async () => {
            await assertStillLoggedIn(viewer, auth);
            return leaderboardAccess(viewer, competitionId);
          })(),
        );
      }
      return checks.get(key);
    };

    // Every connection is listed first, so one that moves rooms below gets one update, not two.
    const watching = [];
    for (const audience of AUDIENCES) {
      const room = roomFor(competitionId, audience);
      if (roomSize(room) === 0) continue;
      for (const socket of await namespace.in(room).fetchSockets()) watching.push({ socket, audience });
    }

    await Promise.all(
      watching.map(async ({ socket, audience }) => {
        const room = roomFor(competitionId, audience);
        try {
          const access = await accessOf(socket.data?.viewer ?? null);
          if (access.audience !== audience) {
            socket.leave(room);
            socket.join(roomFor(competitionId, access.audience));
          }
          socket.emit(LEADERBOARD_EVENTS.UPDATE, update(presentLeaderboard(board, access)));
        } catch (error) {
          if (error instanceof AppError) {
            socket.emit(LEADERBOARD_EVENTS.CLOSED, { competitionId, ...errorBody(error) });
            socket.leave(room);
          } else {
            logger.error("Leaderboard viewer check failed", {
              competitionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }),
    );
  }

  // A change that arrives while an update or a retry is waiting joins it: the standings are
  // calculated when the timer runs, so they include every change made before then. The joined
  // update keeps the most retries either of them had.
  const waiting = new Map();
  let closed = false;
  function schedule(competitionId, reason, wait, retriesLeft) {
    if (closed) return;
    const pending = waiting.get(competitionId);
    if (pending) {
      pending.retriesLeft = Math.max(pending.retriesLeft, retriesLeft);
      return;
    }
    const update = { retriesLeft, timer: null };
    update.timer = setTimeout(() => {
      waiting.delete(competitionId);
      sendUpdate(competitionId, reason).catch((error) => {
        logger.error("Leaderboard update failed", {
          competitionId,
          retriesLeft: update.retriesLeft,
          error: error instanceof Error ? error.message : String(error),
        });
        if (update.retriesLeft > 0) {
          schedule(competitionId, reason, retryDelayMs, update.retriesLeft - 1);
        }
      });
    }, wait);
    update.timer.unref?.();
    waiting.set(competitionId, update);
  }
  const stopListening = onLeaderboardChanged(({ competitionId, reason }) => {
    schedule(competitionId, reason, delayMs, LEADERBOARD_UPDATE_RETRIES);
  });

  return {
    sendUpdate,
    close() {
      closed = true;
      stopListening();
      for (const { timer } of waiting.values()) clearTimeout(timer);
      waiting.clear();
    },
  };
}
