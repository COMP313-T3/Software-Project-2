import { ROLES } from "../constants/roles.js";
import {
  SCORECARD_EVENTS,
  SCORECARD_MAX_PER_CONNECTION,
  SCORECARD_UPDATE_DELAY_MS,
} from "../constants/scorecard.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";
import { onLeaderboardChanged } from "../services/leaderboardEvents.js";
import { getMyScorecard } from "../services/scorecardService.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import {
  assertStillLoggedIn,
  errorBody,
  refusedConnection,
  viewerFromToken,
} from "./socketAuth.js";

/**
 * The Socket.IO room of one Climber's scorecard in one competition. Only that Climber's own
 * connections ever join it: the Climber in the name always comes from their access token, so no
 * other Climber receives their private updates (US-031 criterion 5).
 *
 * @param {string} competitionId The competition.
 * @param {string} climberId The Climber, from the access token.
 * @returns {string} The room's name.
 */
export function scorecardRoom(competitionId, climberId) {
  return `scorecard:${competitionId}:${climberId}`;
}

function roomPrefix(competitionId) {
  return `scorecard:${competitionId}:`;
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

function notYourScorecard() {
  return new AppError(403, "SCORECARD_FORBIDDEN", "You can only follow your own scorecard.");
}

/** What a scorecard says, without when it was made, so the same scorecard is never sent twice. */
function fingerprintOf(scorecard) {
  const { generatedAt: _generatedAt, ...content } = scorecard;
  return JSON.stringify(content);
}

/**
 * Live scorecards over Socket.IO (US-031 criterion 4).
 *
 * Connecting: io("<API>/scorecard", { auth: { token } }) with a logged-in Climber's access token.
 * A connection without a token, with an invalid or expired one, or from another role is refused
 * with { error, message } in err.data (401 NOT_AUTHENTICATED, TOKEN_EXPIRED, SESSION_EXPIRED, or
 * 403 ROLE_FORBIDDEN), so the page can refresh its token and connect again.
 *
 * Client events, each with an acknowledgement callback:
 * - "scorecard:join" { competitionId }: starts following the Climber's own scorecard for a
 *   competition. The acknowledgement is { ok: true, scorecard }, shaped like
 *   GET /api/competitions/:competitionId/scorecard, or { ok: false, error } with the same errors
 *   (404 COMPETITION_NOT_FOUND or REGISTRATION_NOT_FOUND). A climberId in the payload must be the
 *   Climber's own (403 SCORECARD_FORBIDDEN otherwise).
 * - "scorecard:leave" { competitionId }: stops following it.
 *
 * Server events:
 * - "scorecard:update" { competitionId, reason, reasons, scorecard }: the whole scorecard again,
 *   after the Climber's official result, the competition's scoring, a problem, or their
 *   registration changed. The page replaces what it shows, so an update never adds a problem or a
 *   result twice. Bursts of changes within SCORECARD_UPDATE_DELAY_MS send one update, and a
 *   change that leaves the scorecard as it was sends nothing.
 * - "scorecard:closed" { competitionId, error, message }: the scorecard stopped being available,
 *   such as when the Climber's registration was removed, their login ended, or the competition
 *   ended (409 SCORECARD_CLOSED, AC-024). The connection stops following it. Joining after the end
 *   answers the same error.
 *
 * Every update checks the connection's login session again first. A database problem while
 * updating is logged and the connection keeps following, so it gets the next update; joining
 * again after a reconnect answers the current scorecard, so nothing missed is lost.
 *
 * Rooms are this server process's. Several API processes would need a shared Socket.IO adapter,
 * such as the Redis one.
 *
 * @param {{ namespace: import("socket.io").Namespace, auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, delayMs?: number, loadScorecard?: typeof getMyScorecard }} options
 *   The /scorecard namespace, the login setup, the wait before an update, and how a scorecard is
 *   read (replaced in tests).
 * @returns {{ close: () => void, sendUpdate: (competitionId: string, options?: { climberIds?: string[] | null, reasons?: string[] }) => Promise<void> }}
 *   close stops listening for changes; sendUpdate sends updates now, for tests.
 */
export function createScorecardRealtime({
  namespace,
  auth,
  delayMs = SCORECARD_UPDATE_DELAY_MS,
  loadScorecard = (climberId, competitionId) => getMyScorecard(climberId, competitionId, { untilEnd: true }),
}) {
  /** The last scorecard sent to each room, so an unchanged one isn't sent again. */
  const lastSent = new Map();

  namespace.use(async (socket, next) => {
    try {
      const viewer = await viewerFromToken(socket.handshake?.auth?.token, auth);
      if (!viewer) {
        throw new AppError(401, "NOT_AUTHENTICATED", "Log in as a Climber to see your scorecard.");
      }
      if (viewer.role !== ROLES.CLIMBER) {
        throw new AppError(403, "ROLE_FORBIDDEN", "Only Climbers have scorecards.");
      }
      socket.data.viewer = viewer;
      next();
    } catch (error) {
      next(refusedConnection(error));
    }
  });

  namespace.on("connection", (socket) => {
    const following = new Set();
    const { viewer } = socket.data;

    socket.on(SCORECARD_EVENTS.JOIN, async (payload, ack) => {
      const reply = replyWith(ack);
      try {
        const competitionId = competitionIdFrom(payload);
        if (payload?.climberId !== undefined && String(payload.climberId).toLowerCase() !== viewer.userId) {
          throw notYourScorecard();
        }
        if (!following.has(competitionId) && following.size >= SCORECARD_MAX_PER_CONNECTION) {
          throw new AppError(
            429,
            "TOO_MANY_SCORECARDS",
            `One connection can follow up to ${SCORECARD_MAX_PER_CONNECTION} scorecards. Leave one first.`,
          );
        }
        await assertStillLoggedIn(viewer, auth);

        // The room is joined before the scorecard is read, so an update sent meanwhile still
        // reaches this connection (the page keeps whichever scorecard is newer). Joining twice is
        // the same as joining once: a room is a set, so no update arrives twice.
        const room = scorecardRoom(competitionId, viewer.userId);
        socket.join(room);
        let scorecard;
        try {
          scorecard = await loadScorecard(viewer.userId, competitionId);
        } catch (error) {
          if (!following.has(competitionId)) {
            socket.leave(room);
            forgetIfEmpty(room);
          }
          throw error;
        }
        following.add(competitionId);
        // What the room's other connections already have stays the comparison for the next update.
        if (!lastSent.has(room)) lastSent.set(room, fingerprintOf(scorecard));
        reply({ ok: true, scorecard });
      } catch (error) {
        if (!(error instanceof AppError)) {
          logger.error("Scorecard join failed", {
            socketId: socket.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        reply({ ok: false, error: errorBody(error) });
      }
    });

    socket.on(SCORECARD_EVENTS.LEAVE, (payload, ack) => {
      const reply = replyWith(ack);
      try {
        const competitionId = competitionIdFrom(payload);
        const room = scorecardRoom(competitionId, viewer.userId);
        socket.leave(room);
        following.delete(competitionId);
        forgetIfEmpty(room);
        reply({ ok: true });
      } catch (error) {
        reply({ ok: false, error: errorBody(error) });
      }
    });

    // Socket.IO removes a closed connection from its rooms itself, before this runs.
    socket.on("disconnect", () => {
      for (const competitionId of following) forgetIfEmpty(scorecardRoom(competitionId, viewer.userId));
      following.clear();
    });
  });

  function roomSize(room) {
    return namespace.adapter?.rooms?.get(room)?.size ?? 0;
  }

  function forgetIfEmpty(room) {
    if (roomSize(room) === 0) lastSent.delete(room);
  }

  function stopFollowing(socket, competitionId, room, error) {
    socket.emit(SCORECARD_EVENTS.CLOSED, { competitionId, ...errorBody(error) });
    socket.leave(room);
    forgetIfEmpty(room);
  }

  /** The rooms an update goes to: the named Climbers', or every followed scorecard of the competition. */
  function roomsFor(competitionId, climberIds) {
    if (climberIds) return climberIds.map((climberId) => scorecardRoom(competitionId, climberId));
    const prefix = roomPrefix(competitionId);
    return [...(namespace.adapter?.rooms?.keys() ?? [])].filter((room) => room.startsWith(prefix));
  }

  /**
   * Reads each followed scorecard again and sends it to that Climber's own connections. Nothing is
   * read for a room nobody is in.
   */
  async function sendUpdate(competitionId, { climberIds = null, reasons = [] } = {}) {
    const prefix = roomPrefix(competitionId);
    for (const room of roomsFor(competitionId, climberIds)) {
      if (roomSize(room) === 0) {
        lastSent.delete(room);
        continue;
      }
      const climberId = room.slice(prefix.length);
      const sockets = await namespace.in(room).fetchSockets();

      // Room membership alone isn't authorization: the login may have ended since joining.
      const stillAllowed = [];
      for (const socket of sockets) {
        try {
          if (socket.data?.viewer?.userId !== climberId) throw notYourScorecard();
          await assertStillLoggedIn(socket.data.viewer, auth);
          stillAllowed.push(socket);
        } catch (error) {
          if (error instanceof AppError) {
            stopFollowing(socket, competitionId, room, error);
          } else {
            logger.error("Scorecard login check failed", {
              competitionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      if (stillAllowed.length === 0) continue;

      let scorecard;
      try {
        scorecard = await loadScorecard(climberId, competitionId);
      } catch (error) {
        if (error instanceof AppError) {
          // Such as a registration that was removed: the scorecard is gone for this Climber.
          for (const socket of stillAllowed) stopFollowing(socket, competitionId, room, error);
          lastSent.delete(room);
        } else {
          logger.error("Scorecard update failed", {
            competitionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      const fingerprint = fingerprintOf(scorecard);
      if (lastSent.get(room) === fingerprint) continue;
      lastSent.set(room, fingerprint);
      const update = { competitionId, reason: reasons[0] ?? null, reasons, scorecard };
      for (const socket of stillAllowed) socket.emit(SCORECARD_EVENTS.UPDATE, update);
    }
  }

  // One wait per competition gathers a burst of changes; updates of one competition run one at a
  // time, so a slower update can never land after a newer one.
  const waiting = new Map();
  const running = new Map();

  function run(competitionId, options) {
    const previous = running.get(competitionId) ?? Promise.resolve();
    const next = previous
      .then(() => sendUpdate(competitionId, options))
      .catch((error) => {
        logger.error("Scorecard update failed", {
          competitionId,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (running.get(competitionId) === next) running.delete(competitionId);
      });
    running.set(competitionId, next);
    return next;
  }

  const stopListening = onLeaderboardChanged(({ competitionId, reason, climberId }) => {
    let batch = waiting.get(competitionId);
    if (!batch) {
      batch = { everyone: false, climberIds: new Set(), reasons: new Set() };
      batch.timer = setTimeout(() => {
        waiting.delete(competitionId);
        run(competitionId, {
          climberIds: batch.everyone ? null : [...batch.climberIds],
          reasons: [...batch.reasons],
        });
      }, delayMs);
      batch.timer.unref?.();
      waiting.set(competitionId, batch);
    }
    if (climberId) batch.climberIds.add(climberId);
    else batch.everyone = true;
    if (reason) batch.reasons.add(reason);
  });

  return {
    sendUpdate,
    close() {
      stopListening();
      for (const batch of waiting.values()) clearTimeout(batch.timer);
      waiting.clear();
      lastSent.clear();
    },
  };
}
