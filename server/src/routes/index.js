import { Router } from "express";
import { createAdminRoutes } from "./adminRoutes.js";
import { createAuthRoutes } from "./authRoutes.js";
import { createGeocodeRoutes } from "./geocodeRoutes.js";
import { healthRoutes } from "./healthRoutes.js";
import { createSessionRoutes } from "./sessionRoutes.js";
import { createUserRoutes } from "./userRoutes.js";
import { createGymAdminRoutes } from "./gymAdminRoutes.js";

/**
 * Builds every route under /api. Each feature mounts its own router here.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, recaptchaSecretKey?: string, signupLimitPerHour: number, googleMapsServerKey: string, geocodeLimitPerHour: number, mailer: import("../services/mailService.js").Mailer | null, appUrl: string, passwordResetLimits: { requestsPerEmailPerHour: number, requestsPerIpPerHour: number, linkTriesPerIpPerHour: number } }} options
 *   Settings the feature routers need.
 * @returns {import("express").Router} The /api router.
 */
export function createApiRoutes({
  auth,
  recaptchaSecretKey,
  signupLimitPerHour,
  googleMapsServerKey,
  geocodeLimitPerHour,
  mailer,
  appUrl,
  passwordResetLimits,
}) {
  const router = Router();

  router.use("/health", healthRoutes);
  router.use("/admin", createAdminRoutes({ auth }));
  router.use("/gym-admin", createGymAdminRoutes({ auth }));
  router.use(
    "/auth",
    createAuthRoutes({ auth, mailer, appUrl, passwordResetLimits }),
  );
  router.use("/session", createSessionRoutes({ auth }));
  router.use(
    "/users",
    createUserRoutes({ recaptchaSecretKey, signupLimitPerHour }),
  );
  router.use(
    "/geocode",
    createGeocodeRoutes({ googleMapsServerKey, geocodeLimitPerHour }),
  );
  
  return router;
}
