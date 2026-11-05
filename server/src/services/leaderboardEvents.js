import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";

const CHANGED = "changed";
const emitter = new EventEmitter();

/**
 * Why a competition's leaderboard may have changed, so listeners can tell an official result
 * from a setting such as public access.
 */
export const LEADERBOARD_CHANGE = Object.freeze({
  RESULT: "result",
  SCORING: "scoring",
  ROUTE: "route",
  REGISTRATION: "registration",
  COMPETITION: "competition",
});

/**
 * Says a competition's standings may have changed (US-020 criterion 3), after the change is saved:
 * an official result was recorded, changed, or deleted, the scoring or a problem's points changed,
 * or a Climber registered, moved division, or was removed. Live leaderboards listen for it. It
 * never throws, so a listener's mistake can't fail the request that saved the result.
 *
 * Listeners run in this server process. Several API processes would need a shared Socket.IO adapter,
 * such as the Redis one, to reach every connection.
 *
 * @param {unknown} competitionId The competition.
 * @param {string} reason One of LEADERBOARD_CHANGE.
 */
export function leaderboardChanged(competitionId, reason) {
  try {
    emitter.emit(CHANGED, { competitionId: String(competitionId), reason });
  } catch (error) {
    logger.error("Leaderboard update failed", {
      competitionId: String(competitionId),
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Calls listener with { competitionId, reason } whenever leaderboardChanged runs.
 *
 * @param {(change: { competitionId: string, reason: string }) => void} listener The listener.
 * @returns {() => void} Stops listening.
 */
export function onLeaderboardChanged(listener) {
  emitter.on(CHANGED, listener);
  return () => emitter.off(CHANGED, listener);
}
