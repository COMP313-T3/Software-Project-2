import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { loadConfig } from "./config/env.js";
import { logger } from "./utils/logger.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Loads server/.env when it exists. Hosting platforms set real environment
 * variables instead, so a missing file is not an error.
 */
function loadEnvFile() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Starts the API: validates settings, connects to MongoDB, and listens for requests.
 *
 * @returns {Promise<void>}
 */
async function start() {
  loadEnvFile();
  const config = loadConfig(process.env);

  const databaseName = await connectDatabase(config.mongodbUri);
  logger.info("Connected to MongoDB", { database: databaseName });
  if (databaseName === "test") {
    logger.warn(
      "Connected to the default database named test. Add the database name to MONGODB_URI, right before the ?.",
    );
  }

  const app = createApp({ clientOrigins: config.clientOrigins });
  const server = app.listen(config.port, () => {
    logger.info("API listening", {
      port: config.port,
      environment: config.nodeEnv,
    });
  });

  const shutdown = (signal) => {
    logger.info("Shutting down", { signal });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason.stack : String(reason),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.stack });
  process.exit(1);
});

try {
  await start();
} catch (error) {
  logger.error("Server failed to start", { error: error.message });
  process.exit(1);
}
