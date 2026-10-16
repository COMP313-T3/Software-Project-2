import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import * as competitionController from "../controllers/competitionController.js";
import * as dashboardController from "../controllers/gymAdminDashboardController.js";
import * as divisionController from "../controllers/divisionController.js";
import * as climberController from "../controllers/climberDetailsController.js";
import * as routeController from "../controllers/routeController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireGymAdmin } from "../middleware/requireGymAdmin.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  createCompetitionSchema,
  updateCompetitionSchema,
} from "../schemas/competitionSchemas.js";
import {
  climberParamsSchema,
  createDivisionSchema,
  divisionAssignmentSchema,
  listClimbersQuerySchema,
} from "../schemas/divisionSchemas.js";
import {
  createRouteSchema,
  routeParamsSchema,
  routeCompetitionParamsSchema,
  updateRouteSchema,
} from "../schemas/routeSchemas.js";
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
 * PATCH /competitions/:competitionId: updates its details and registration settings (US-013).
 * GET /competitions/:competitionId/divisions: its divisions, with Climber counts (US-014).
 * POST /competitions/:competitionId/divisions: creates a division in it (US-014).
 * GET /competitions/:competitionId/routes: its boulder problems, by route number (US-016, US-017).
 * POST /competitions/:competitionId/routes: creates a boulder problem in it (US-016).
 * GET /competitions/:competitionId/routes/:routeId: loads a route in it (US-017).
 * PATCH /competitions/:competitionId/routes/:routeId: updates its permitted details (US-017).
 * GET /competitions/:competitionId/climbers: its registered Climbers and their divisions (US-014).
 * PUT /competitions/:competitionId/climbers/:climberId/division: places or moves a registered
 *   Climber into one of its divisions (US-014).
 * GET /competitions/:competitionId/climbers/:climberId: selected registration details (US-015).
 * PATCH /competitions/:competitionId/climbers/:climberId: changes its division (US-015).
 * DELETE /competitions/:competitionId/climbers/:climberId: removes its registration (US-015).
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
  router.patch(
    "/competitions/:competitionId",
    validateParams(competitionIdParamsSchema),
    validateBody(updateCompetitionSchema),
    competitionController.updateCompetition,
  );

  router.get(
    "/competitions/:competitionId/divisions",
    validateParams(competitionIdParamsSchema),
    divisionController.listDivisions,
  );
  router.post(
    "/competitions/:competitionId/divisions",
    validateParams(competitionIdParamsSchema),
    validateBody(createDivisionSchema),
    divisionController.createDivision,
  );
  router.get(
    "/competitions/:competitionId/routes",
    validateParams(routeCompetitionParamsSchema),
    routeController.listRoutes,
  );
  router.post(
    "/competitions/:competitionId/routes",
    validateParams(routeCompetitionParamsSchema),
    validateBody(createRouteSchema),
    routeController.createRoute,
  );
  router.get(
    "/competitions/:competitionId/routes/:routeId",
    validateParams(routeParamsSchema),
    routeController.getRoute,
  );
  router.patch(
    "/competitions/:competitionId/routes/:routeId",
    validateParams(routeParamsSchema),
    validateBody(updateRouteSchema),
    routeController.updateRoute,
  );
  router.get(
    "/competitions/:competitionId/climbers",
    validateParams(competitionIdParamsSchema),
    validateQuery(listClimbersQuerySchema),
    divisionController.listClimbers,
  );
  router.put(
    "/competitions/:competitionId/climbers/:climberId/division",
    validateParams(climberParamsSchema),
    validateBody(divisionAssignmentSchema),
    divisionController.assignDivision,
  );

  router.get(
    "/competitions/:competitionId/climbers/:climberId",
    validateParams(climberParamsSchema),
    climberController.getClimber,
  );
  router.patch(
    "/competitions/:competitionId/climbers/:climberId",
    validateParams(climberParamsSchema),
    validateBody(divisionAssignmentSchema),
    climberController.updateClimber,
  );
  router.delete(
    "/competitions/:competitionId/climbers/:climberId",
    validateParams(climberParamsSchema),
    climberController.removeClimber,
  );

  return router;
}
