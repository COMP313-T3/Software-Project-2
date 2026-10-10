import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import * as competitionController from "../controllers/competitionController.js";
import * as dashboardController from "../controllers/gymAdminDashboardController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireGymAdmin } from "../middleware/requireGymAdmin.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { createCompetitionSchema } from "../schemas/competitionSchemas.js";
import {
  competitionIdParamsSchema,
  listManagedCompetitionsQuerySchema,
} from "../schemas/gymAdminSchemas.js";

/**
 * Routes under /api/gym-admin, for Gym Administrators working on their own gyms.
 * Every route needs the access token and the GYM_ADMIN role, and requireGymAdmin then looks up
 * the user's active gyms in the database, so each query and each new record is limited to them.
 *
 * GET /dashboard: the user's gyms, competition counts, and next upcoming competitions (US-011).
 * GET /competitions: the user's gyms' competitions, by period (upcoming, past, all) and page (US-011).
 * POST /competitions: creates a competition for one of the user's gyms (US-012).
 * GET /competitions/:competitionId: one of them, with its management tools (US-011).
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
  router.post(
    "/competitions",
    validateBody(createCompetitionSchema),
    competitionController.createCompetition,
  );
  router.get(
    "/competitions/:competitionId",
    validateParams(competitionIdParamsSchema),
    dashboardController.getCompetition,
  );

  return router;
}
