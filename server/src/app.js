import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAuthContext } from "./config/auth.js";
import {
  DEFAULT_APP_URL,
  DEFAULT_GEOCODE_LIMIT_PER_HOUR,
  DEFAULT_LOGIN_LIMITS,
  DEFAULT_PASSWORD_RESET_LIMITS,
  DEFAULT_SESSION,
  DEFAULT_SIGNUP_LIMIT_PER_HOUR,
} from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestId } from "./middleware/requestId.js";
import { requireAllowedOrigin } from "./middleware/requireAllowedOrigin.js";
import { createApiRoutes } from "./routes/index.js";

const BODY_LIMIT = "100kb";

/**
 * Builds the Express app without starting it, so tests can use it directly.
 *
 * @param {{ clientOrigins: string[], recaptchaSecretKey?: string, signupLimitPerHour?: number, googleMapsServerKey?: string, geocodeLimitPerHour?: number, mailer?: import("./services/mailService.js").Mailer | null, appUrl?: string, passwordResetLimits?: { requestsPerEmailPerHour: number, requestsPerIpPerHour: number, linkTriesPerIpPerHour: number }, authSecret?: string, session?: { idleMinutes: number, absoluteHours: number }, loginLimits?: typeof DEFAULT_LOGIN_LIMITS, secureCookies?: boolean }} options
 *   Browser origins allowed to call the API with cookies, the reCAPTCHA secret key (sign-up
 *   fails without it), the sign-up attempts allowed per IP address per hour, the Google Maps
 *   key for address lookups (they're off without it), the lookups allowed per IP address per
 *   hour, the mailer for account emails (password reset is off without it), the web app's
 *   address for links in emails, the password reset limits, the key login tokens are signed
 *   with (a random one when empty), how long a login lasts, the login limits, and whether the
 *   login cookies are HTTPS only, as they must be in production.
 * @returns {import("express").Express} The configured app.
 */
export function createApp({
  clientOrigins,
  recaptchaSecretKey,
  signupLimitPerHour = DEFAULT_SIGNUP_LIMIT_PER_HOUR,
  googleMapsServerKey = "",
  geocodeLimitPerHour = DEFAULT_GEOCODE_LIMIT_PER_HOUR,
  mailer = null,
  appUrl = DEFAULT_APP_URL,
  passwordResetLimits = DEFAULT_PASSWORD_RESET_LIMITS,
  authSecret = "",
  session = DEFAULT_SESSION,
  loginLimits = DEFAULT_LOGIN_LIMITS,
  secureCookies = false,
}) {
  const app = express();
  const auth = createAuthContext({
    authSecret,
    session,
    loginLimits,
    secureCookies,
  });

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, !origin || clientOrigins.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(cookieParser());
  app.use("/api", requireAllowedOrigin(clientOrigins));

  app.use(
    "/api",
    createApiRoutes({
      auth,
      recaptchaSecretKey,
      signupLimitPerHour,
      googleMapsServerKey,
      geocodeLimitPerHour,
      mailer,
      appUrl,
      passwordResetLimits,
    }),
  );
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
