import { logger } from "./logger.js";

const running = new Set();

/**
 * Runs work without making the request wait for it. A failure is logged, never thrown.
 *
 * @param {() => Promise<unknown>} work The work to run.
 * @param {string} failureMessage What the log says if the work fails.
 * @param {Record<string, unknown>} [fields] Extra log context, such as the request ID.
 */
export function runInBackground(work, failureMessage, fields = {}) {
  const task = Promise.resolve()
    .then(work)
    .catch((error) => {
      logger.error(failureMessage, {
        ...fields,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => running.delete(task));
  running.add(task);
}

/**
 * Waits until no background work is left, including work started while waiting. The server
 * waits for this before it shuts down, so an email being sent isn't cut off.
 *
 * @returns {Promise<void>}
 */
export async function backgroundTasksDone() {
  while (running.size > 0) {
    await Promise.allSettled(running);
  }
}
