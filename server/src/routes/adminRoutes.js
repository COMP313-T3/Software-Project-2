import { Router } from "express";
import { getDashboardSummary } from "../controllers/adminController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ROLES } from "../constants/roles.js";

/**
 * 
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext> }} options
 *   
 * @returns {import("express").Router} 
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
