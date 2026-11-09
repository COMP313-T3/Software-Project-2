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
 * or a Climber registered, moved division, or was removed. Live leaderboards and live scorecards
 * (US-031) listen for it. It never throws, so a listener's mistake can't fail the request that
 * saved the result.
 *
 * When the change is about one Climber, such as their official result, pass climberId: live
 * scorecards then update only that Climber's scorecard. Without it, every scorecard of the
 * competition is checked, as a scoring change can move anyone's scores.
 *
 * Listeners run in this server process. Several API processes would need a shared Socket.IO adapter,
 * such as the Redis one, to reach every connection.
 *
 * @param {unknown} competitionId The competition.
 * @param {string} reason One of LEADERBOARD_CHANGE.
 * @param {{ climberId?: unknown }} [details] The one Climber the change is about, if any.
 */
export function leaderboardChanged(competitionId, reason, { climberId } = {}) {
  try {
    emitter.emit(CHANGED, {
      competitionId: String(competitionId),
      reason,
      ...(climberId ? { climberId: String(climberId) } : {}),
    });
  } catch (error) {
    logger.error("Leaderboard update failed", {
      competitionId: String(competitionId),
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Calls listener with { competitionId, reason, climberId? } whenever leaderboardChanged runs.
 *
 * @param {(change: { competitionId: string, reason: string, climberId?: string }) => void} listener The listener.
 * @returns {() => void} Stops listening.
 */
export function onLeaderboardChanged(listener) {
  emitter.on(CHANGED, listener);
  return () => emitter.off(CHANGED, listener);
}
