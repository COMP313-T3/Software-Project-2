import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { loadConfig, RECAPTCHA_TEST_SECRET_KEY } from "./config/env.js";
import { createMailer } from "./services/mailService.js";
import { backgroundTasksDone } from "./utils/backgroundTasks.js";
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

  if (config.recaptchaSecretKey === RECAPTCHA_TEST_SECRET_KEY) {
    logger.warn(
      "Using Google's reCAPTCHA test key, so every robot check passes. Set RECAPTCHA_SECRET_KEY to use the real key.",
    );
  }

  if (!config.googleMapsServerKey) {
    logger.warn(
      "GOOGLE_MAPS_SERVER_KEY is empty, so picking an address or a map pin at sign-up won't fill in the address. Set it to your Google Maps key.",
    );
  }

  if (!config.authSecret) {
    logger.warn(
      "AUTH_SECRET is empty, so the API makes a random one each time it starts. Logins keep working across restarts, but set it before deploying.",
    );
  }

  const mailer = createMailer(config);
  if (!config.smtp) {
    logger.warn(
      mailer
        ? "SMTP_USER and SMTP_PASS are empty, so emails such as password reset links print in this terminal instead of being sent."
        : "SMTP_USER and SMTP_PASS are empty, so password reset emails can't be sent.",
    );
  } else {
    mailer.verify().then(
      () =>
        logger.info("Signed in to the SMTP server", { host: config.smtp.host }),
      (error) =>
        logger.warn(
          "Couldn't sign in to the SMTP server, so emails won't send. Check SMTP_USER and SMTP_PASS.",
          { host: config.smtp.host, error: error.message },
        ),
    );
  }

  const app = createApp({
    clientOrigins: config.clientOrigins,
    recaptchaSecretKey: config.recaptchaSecretKey,
    signupLimitPerHour: config.signupLimitPerHour,
    googleMapsServerKey: config.googleMapsServerKey,
    mailer,
    appUrl: config.appUrl,
    authSecret: config.authSecret,
    session: config.session,
    secureCookies: config.nodeEnv === "production",
  });
  const server = app.listen(config.port, () => {
    logger.info("API listening", {
      port: config.port,
      environment: config.nodeEnv,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(async () => {
      await backgroundTasksDone();
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
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
