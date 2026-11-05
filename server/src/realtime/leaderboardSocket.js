import {
  LEADERBOARD_AUDIENCE,
  LEADERBOARD_EVENTS,
  LEADERBOARD_MAX_ROOMS_PER_CONNECTION,
  LEADERBOARD_UPDATE_DELAY_MS,
} from "../constants/leaderboard.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";
import { onLeaderboardChanged } from "../services/leaderboardEvents.js";
import {
  calculateLeaderboard,
  leaderboardAccess,
  presentLeaderboard,
} from "../services/leaderboardService.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

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

/** The API's error shape, { error, message }, for an acknowledgement or a refused connection. */
function errorBody(error) {
  if (error instanceof AppError) return { error: error.code, message: error.message };
  return { error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
}

/**
 * Who opened the connection. A connection with no token is a Visitor, who can follow public
 * leaderboards only. A token is checked exactly like the Authorization header of a request
 * (requireAuth): it must be valid, and its login session still going.
 */
async function viewerOf(socket, { accessTokens, sessions }) {
  const token = socket.handshake?.auth?.token;
  if (token === undefined || token === null || token === "") return null;
  if (typeof token !== "string") {
    throw new AppError(401, "NOT_AUTHENTICATED", "Log in to continue.");
  }
  const claims = await accessTokens.verify(token);
  await sessions.findActive(claims.sessionId, claims.userId);
  return { userId: claims.userId, role: claims.role };
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
 *   changes within LEADERBOARD_UPDATE_DELAY_MS send one update.
 * - "leaderboard:closed" { competitionId, error, message }: the leaderboard stopped being available
 *   to this connection, such as when public access was turned off. The connection stops following
 *   it.
 *
 * A disconnect needs no clean-up: Socket.IO removes the connection from its rooms.
 *
 * @param {{ namespace: import("socket.io").Namespace, auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, delayMs?: number }} options
 *   The /leaderboard namespace, the login setup, and the wait before an update.
 * @returns {{ close: () => void, sendUpdate: (competitionId: string, reason?: string) => Promise<void> }}
 *   close stops listening for changes; sendUpdate sends an update now, for tests.
 */
export function createLeaderboardRealtime({
  namespace,
  auth,
  delayMs = LEADERBOARD_UPDATE_DELAY_MS,
}) {
  namespace.use(async (socket, next) => {
    try {
      socket.data.viewer = await viewerOf(socket, auth);
      next();
    } catch (error) {
      const refused = new Error(error instanceof AppError ? error.message : "Log in to continue.");
      refused.data = errorBody(error);
      next(refused);
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
   * Recalculates a competition's standings and sends them to everyone following it, each in their
   * own audience's view. Nothing is calculated when nobody is following.
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
    // Room membership alone is not authorization: a session, gym assignment, registration,
    // or public access may have changed since joining. Recheck before every private/public push.
    for (const audience of AUDIENCES) {
      const room = roomFor(competitionId, audience);
      if (roomSize(room) === 0) continue;
      const viewers = await namespace.in(room).fetchSockets();
      for (const socket of viewers) {
        try {
          const viewer = await viewerOf(socket, auth);
          const access = await leaderboardAccess(viewer, competitionId);
          if (access.audience !== audience) {
            throw new AppError(403, "LEADERBOARD_ACCESS_LOST", "You no longer have access to this leaderboard.");
          }
          socket.emit(LEADERBOARD_EVENTS.UPDATE, update(presentLeaderboard(board, access)));
        } catch (error) {
          socket.emit(LEADERBOARD_EVENTS.CLOSED, { competitionId, ...errorBody(error) });
          socket.leave(room);
          if (!(error instanceof AppError)) logger.error("Leaderboard viewer check failed", { competitionId, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }

  const waiting = new Map();
  const stopListening = onLeaderboardChanged(({ competitionId, reason }) => {
    if (waiting.has(competitionId)) return;
    const timer = setTimeout(() => {
      waiting.delete(competitionId);
      sendUpdate(competitionId, reason).catch((error) => {
        logger.error("Leaderboard update failed", {
          competitionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, delayMs);
    timer.unref?.();
    waiting.set(competitionId, timer);
  });

  return {
    sendUpdate,
    close() {
      stopListening();
      for (const timer of waiting.values()) clearTimeout(timer);
      waiting.clear();
    },
  };
}
