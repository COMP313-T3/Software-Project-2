import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import * as discoveryController from "../controllers/discoveryController.js";
import { createRegistration } from "../controllers/registrationController.js";
import { getMyRegistration } from "../controllers/registrationStatusController.js";
import { validateBody } from "../middleware/validateBody.js";
import { createRegistrationSchema } from "../schemas/registrationSchemas.js";
import { noStore } from "../middleware/noStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { createAddressPoints } from "../services/addressPoints.js";
import {
  competitionMapQuerySchema,
  discoverCompetitionsQuerySchema,
} from "../schemas/discoverySchemas.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";

/**
 * Routes under /api/competitions, where Climbers discover competitions (US-025). Every route needs
 * the access token and the CLIMBER role (FR-007). Only PUBLISHED competitions of ACTIVE gyms are
 * ever answered, so drafts stay with their Gym Admins. Every answer is sent with
 * Cache-Control: no-store, since each one is for one Climber and a search can carry where they are.
 *
 * GET /: the List View, filtered, ordered and paged (US-025 criteria 1 to 3 and 6, US-026).
 * GET /map: the same competitions as map pins, with the starting point (US-025 criterion 4, US-027).
 * GET /filters: the choices for the search filters and order (US-025 criteria 3 and 6, US-026).
 * POST /:competitionId/registrations: registers the Climber in one of its divisions (US-028).
 * GET /:competitionId/registration: the Climber's own registration status for it (US-029).
 * GET /:competitionId: one competition's Event Details (US-025 criterion 5).
 *
 * /map and /filters come before /:competitionId, so those words are never read as an ID.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, googleMapsServerKey?: string }} options
 *   The login setup, and the Google Maps key that finds map pins from addresses. Without the
 *   key, the map shows saved pins only.
 * @returns {import("express").Router} The router.
 */
export function createCompetitionRoutes({ auth, googleMapsServerKey = "" }) {
  const router = Router();
  const findPoints = googleMapsServerKey
    ? createAddressPoints(googleMapsServerKey)
    : null;

  router.use(noStore, requireAuth(auth), requireRole(ROLES.CLIMBER));

  router.get(
    "/",
    validateQuery(discoverCompetitionsQuerySchema),
    discoveryController.listCompetitions,
  );
  router.get(
    "/map",
    validateQuery(competitionMapQuerySchema),
    discoveryController.createCompetitionMapHandler(findPoints),
  );
  router.get("/filters", discoveryController.getDiscoveryOptions);
  router.post(
    "/:competitionId/registrations",
    validateParams(competitionIdParamsSchema),
    validateBody(createRegistrationSchema),
    createRegistration,
  );
  router.get(
    "/:competitionId/registration",
    validateParams(competitionIdParamsSchema),
    getMyRegistration,
  );
  router.get(
    "/:competitionId",
    validateParams(competitionIdParamsSchema),
    discoveryController.getCompetition,
  );

  return router;
}
