import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import * as discoveryController from "../controllers/discoveryController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  competitionMapQuerySchema,
  discoverCompetitionsQuerySchema,
} from "../schemas/discoverySchemas.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";

/**
 * Routes under /api/competitions, where Climbers discover competitions (US-025). Every route needs
 * the access token and the CLIMBER role (FR-007). Only PUBLISHED competitions of ACTIVE gyms are
 * ever answered, so drafts stay with their Gym Admins.
 *
 * GET /: the List View, filtered and paged (US-025 criteria 1 to 3, US-026).
 * GET /map: the same competitions as map pins (US-025 criterion 4, US-027).
 * GET /filters: the choices for the search filters (US-025 criterion 3).
 * GET /:competitionId: one competition's Event Details (US-025 criterion 5).
 *
 * /map and /filters come before /:competitionId, so those words are never read as an ID.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext> }} options
 *   The login setup.
 * @returns {import("express").Router} The router.
 */
export function createCompetitionRoutes({ auth }) {
  const router = Router();

  router.use(requireAuth(auth), requireRole(ROLES.CLIMBER));

  router.get(
    "/",
    validateQuery(discoverCompetitionsQuerySchema),
    discoveryController.listCompetitions,
  );
  router.get(
    "/map",
    validateQuery(competitionMapQuerySchema),
    discoveryController.getCompetitionMap,
  );
  router.get("/filters", discoveryController.getDiscoveryOptions);
  router.get(
    "/:competitionId",
    validateParams(competitionIdParamsSchema),
    discoveryController.getCompetition,
  );

  return router;
}
