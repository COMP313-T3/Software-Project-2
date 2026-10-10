import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import * as dashboardController from "../controllers/gymAdminDashboardController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireGymAdmin } from "../middleware/requireGymAdmin.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  competitionIdParamsSchema,
  listManagedCompetitionsQuerySchema,
} from "../schemas/gymAdminSchemas.js";

/**
 * Routes under /api/gym-admin (US-011), for Gym Administrators working on their own gyms.
 * Every route needs the access token and the GYM_ADMIN role, and requireGymAdmin then looks up
 * the user's active gyms in the database, so each query can be limited to them.
 *
 * GET /dashboard: the user's gyms, competition counts, and next upcoming competitions.
 * GET /competitions: the user's gyms' competitions, by period (upcoming, past, all) and page.
 * GET /competitions/:competitionId: one of them, with its management tools.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext> }} options
 *   The login setup.
 * @returns {import("express").Router} The router.
 */
export function createGymAdminRoutes({ auth }) {
  const router = Router();

  router.use(requireAuth(auth), requireRole(ROLES.GYM_ADMIN), requireGymAdmin);

  router.get("/dashboard", dashboardController.getDashboard);
  router.get(
    "/competitions",
    validateQuery(listManagedCompetitionsQuerySchema),
    dashboardController.listCompetitions,
  );
  router.get(
    "/competitions/:competitionId",
    validateParams(competitionIdParamsSchema),
    dashboardController.getCompetition,
  );

  return router;
}
