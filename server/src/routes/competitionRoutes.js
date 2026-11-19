import { Router } from "express";
import { CLIMBER_ASSISTANT_QUESTIONS_PER_HOUR } from "../constants/climberRouteAssistant.js";
import { ROLES } from "../constants/roles.js";
import { createClimberAssistantHandlers } from "../controllers/climberRouteAssistantController.js";
import * as discoveryController from "../controllers/discoveryController.js";
import * as displaySettingsController from "../controllers/displaySettingsController.js";
import * as leaderboardController from "../controllers/leaderboardController.js";
import { listMyEvents } from "../controllers/myEventsController.js";
import { createRegistration } from "../controllers/registrationController.js";
import { getMyRegistration } from "../controllers/registrationStatusController.js";
import { clearMyResult, getMyScorecard, saveMyResult } from "../controllers/scorecardController.js";
import { hourlyRateLimit } from "../middleware/hourlyRateLimit.js";
import { validateBody } from "../middleware/validateBody.js";
import { createRegistrationSchema } from "../schemas/registrationSchemas.js";
import { noStore } from "../middleware/noStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { createAddressPoints } from "../services/addressPoints.js";
import { createGeminiClient } from "../services/geminiClient.js";
import { askClimberAssistantSchema } from "../schemas/climberRouteAssistantSchemas.js";
import {
  competitionMapQuerySchema,
  discoverCompetitionsQuerySchema,
} from "../schemas/discoverySchemas.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";
import { leaderboardQuerySchema } from "../schemas/leaderboardSchemas.js";
import { ownResultSchema, scorecardResultParamsSchema } from "../schemas/scorecardSchemas.js";

/**
 * Routes under /api/competitions, where Climbers discover competitions (US-025). Every route needs
 * the access token and the CLIMBER role (FR-007). Only PUBLISHED competitions of ACTIVE gyms are
 * ever answered, so drafts stay with their Gym Admins. Every answer is sent with
 * Cache-Control: no-store, since each one is for one Climber and a search can carry where they are.
 *
 * GET /: the List View, filtered, ordered and paged (US-025 criteria 1 to 3 and 6, US-026).
 * GET /map: the same competitions as map pins, with the starting point (US-025 criterion 4, US-027).
 * GET /filters: the choices for the search filters and order (US-025 criteria 3 and 6, US-026).
 * GET /my-events: the logged-in Climber's registrations and competitions (US-030).
 * POST /:competitionId/registrations: registers the Climber in one of its divisions (US-028).
 * GET /:competitionId/registration: the Climber's own registration status for it (US-029).
 * GET /:competitionId/leaderboard: its live standings, with the Climber's own place, for a
 *   competition they registered for or one with a public leaderboard (US-020, US-032).
 * GET /:competitionId/scorecard: the Climber's own digital scorecard for a competition they
 *   registered for: its problems, with their official result on each (US-031). Live updates come
 *   over Socket.IO (realtime/scorecardSocket.js).
 * PUT and DELETE /:competitionId/scorecard/routes/:routeId/result: the Climber records, corrects
 *   or clears their own result on one problem on the competition day (US-031), and gets their
 *   updated scorecard back.
 * GET /:competitionId/route-assistant: whether the Climber can ask the AI Route Assistant about a
 *   competition they registered for, and the data an answer would use (US-033).
 * POST /:competitionId/route-assistant: asks which routes to try or how far a place is, from the
 *   chatbot on My scorecard or the leaderboard, with the earlier messages of its conversation, and
 *   gets the AI's suggestion with the routes it recommends (US-033). Counted per Climber, up to
 *   CLIMBER_ASSISTANT_QUESTIONS_PER_HOUR answered questions an hour.
 * GET /:competitionId: one competition's Event Details (US-025 criterion 5).
 *
 * /map, /filters and /my-events come before /:competitionId, so those words are never read as an
 * ID.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, googleMapsServerKey?: string, routeAssistant?: ReturnType<typeof createGeminiClient> }} options
 *   The login setup, the Google Maps key that finds map pins from addresses (without it, the map
 *   shows saved pins only), and the AI client of the Route Assistant (off without GEMINI_API_KEY).
 * @returns {import("express").Router} The router.
 */
export function createCompetitionRoutes({ auth, googleMapsServerKey = "", routeAssistant = createGeminiClient() }) {
  const router = Router();
  const findPoints = googleMapsServerKey
    ? createAddressPoints(googleMapsServerKey)
    : null;

  router.get(
    "/:competitionId/display-settings",
    noStore,
    validateParams(competitionIdParamsSchema),
    displaySettingsController.getPublicDisplaySettings,
  );

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
  router.get("/my-events", listMyEvents);
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
    "/:competitionId/leaderboard",
    validateParams(competitionIdParamsSchema),
    validateQuery(leaderboardQuerySchema),
    leaderboardController.getClimberLeaderboard,
  );
  router.get(
    "/:competitionId/scorecard",
    validateParams(competitionIdParamsSchema),
    getMyScorecard,
  );
  router.put(
    "/:competitionId/scorecard/routes/:routeId/result",
    validateParams(scorecardResultParamsSchema),
    validateBody(ownResultSchema),
    saveMyResult,
  );
  router.delete(
    "/:competitionId/scorecard/routes/:routeId/result",
    validateParams(scorecardResultParamsSchema),
    clearMyResult,
  );
  const assistant = createClimberAssistantHandlers(routeAssistant);
  router.get(
    "/:competitionId/route-assistant",
    validateParams(competitionIdParamsSchema),
    assistant.getClimberAssistant,
  );
  router.post(
    "/:competitionId/route-assistant",
    validateParams(competitionIdParamsSchema),
    validateBody(askClimberAssistantSchema),
    // Counted per Climber, not per IP address, so a gym's shared Wi-Fi doesn't share one limit.
    // Only answered questions count, so an AI outage doesn't use up a Climber's questions.
    hourlyRateLimit(
      CLIMBER_ASSISTANT_QUESTIONS_PER_HOUR,
      "You've asked the Route Assistant a lot of questions this hour. Try again later.",
      (req) => `climber-route-assistant:${req.auth.userId}`,
      { countFailed: false },
    ),
    assistant.askClimberAssistant,
  );
  router.get(
    "/:competitionId",
    validateParams(competitionIdParamsSchema),
    discoveryController.getCompetition,
  );

  return router;
}
