const DEFAULT_PORT = 4000;
const DEFAULT_CLIENT_ORIGINS = "http://localhost:5173";

/**
 * Splits CLIENT_ORIGINS and checks that each entry is a bare origin. CORS compares
 * origins exactly, so a trailing slash or a path would silently block the browser.
 *
 * @param {string} value Comma-separated origins.
 * @returns {string[]} The origins.
 * @throws {Error} When an entry is not a bare origin.
 */
function parseOrigins(value) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.origin !== origin) {
      throw new Error(
        "CLIENT_ORIGINS must list origins like http://localhost:5173, separated by commas, with no trailing slash.",
      );
    }
  }

  return origins;
}

/**
 * Reads and validates the server settings from environment variables.
 * Error messages name the variable but never include its value.
 *
 * @param {Record<string, string | undefined>} env Environment variables, usually process.env.
 * @returns {{ nodeEnv: string, port: number, mongodbUri: string, clientOrigins: string[] }} Validated settings.
 * @throws {Error} When a required variable is missing or a value is invalid.
 */
export function loadConfig(env) {
  const mongodbUri = env.MONGODB_URI?.trim();
  if (!mongodbUri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and fill it in.",
    );
  }
  if (!/^mongodb(\+srv)?:\/\//.test(mongodbUri)) {
    throw new Error(
      "MONGODB_URI must start with mongodb:// or mongodb+srv://.",
    );
  }

  const port = env.PORT?.trim() ? Number(env.PORT) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a whole number between 1 and 65535.");
  }

  return {
    nodeEnv: env.NODE_ENV?.trim() || "development",
    port,
    mongodbUri,
    clientOrigins: parseOrigins(env.CLIENT_ORIGINS ?? DEFAULT_CLIENT_ORIGINS),
  };
}
