/**
 * Writes one JSON log line. Errors go to stderr, everything else to stdout.
 *
 * @param {"info" | "warn" | "error"} level Severity of the entry.
 * @param {string} message Short description of the event.
 * @param {Record<string, unknown>} [fields] Extra context. Never include passwords, tokens, cookies, or connection strings.
 */
function write(level, message, fields = {}) {
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

/**
 * Structured JSON logger for the API.
 */
export const logger = {
  /**
   * @param {string} message Short description of the event.
   * @param {Record<string, unknown>} [fields] Extra context.
   */
  info: (message, fields) => write("info", message, fields),
  /**
   * @param {string} message Short description of the event.
   * @param {Record<string, unknown>} [fields] Extra context.
   */
  warn: (message, fields) => write("warn", message, fields),
  /**
   * @param {string} message Short description of the event.
   * @param {Record<string, unknown>} [fields] Extra context.
   */
  error: (message, fields) => write("error", message, fields),
};
