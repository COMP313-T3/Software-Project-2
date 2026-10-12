import { Router } from "express";
import { getDashboardSummary } from "../controllers/adminController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../constants/roles.js";

/**
 * Routes under /api/admin, for the System Administrator. GET /dashboard answers the platform's
 * gym, user, and pending request counts (US-003). Needs the access token and the ADMIN role.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext> }} options
 *   The login setup.
 * @returns {import("express").Router} The router.
 */
export function createAdminRoutes({ auth }) {
  const router = Router();

  router.get(
    "/dashboard",
    requireAuth(auth),
    requireRole(ROLES.ADMIN),
    getDashboardSummary,
  );

  return router;
}
