import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";

const CHANGED = "changed";
const emitter = new EventEmitter();

/**
 * Says the data some pages show has changed, after the change is saved, so those pages can reload
 * it without a refresh button. The live page updates (realtime/pageUpdateSocket.js) listen for it.
 * It never throws, so a listener's mistake can't fail the request that saved the change.
 *
 * Listeners run in this server process. Several API processes would need a shared Socket.IO
 * adapter, such as the Redis one, to reach every connection.
 *
 * @param {string} topic One of PAGE_TOPIC.
 * @param {{ competitionId?: unknown }} [details] The one competition the change is about, if any.
 */
export function pageChanged(topic, { competitionId } = {}) {
  try {
    emitter.emit(CHANGED, {
      topic,
      ...(competitionId ? { competitionId: String(competitionId) } : {}),
    });
  } catch (error) {
    logger.error("Page update failed", {
      topic,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Calls listener with { topic, competitionId? } whenever pageChanged runs.
 *
 * @param {(change: { topic: string, competitionId?: string }) => void} listener The listener.
 * @returns {() => void} Stops listening.
 */
export function onPageChanged(listener) {
  emitter.on(CHANGED, listener);
  return () => emitter.off(CHANGED, listener);
}
