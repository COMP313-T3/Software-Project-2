import { Router } from "express";
import { PUBLIC_LEADERBOARD_LIMIT_PER_HOUR } from "../constants/leaderboard.js";
import * as leaderboardController from "../controllers/leaderboardController.js";
import { hourlyRateLimit } from "../middleware/hourlyRateLimit.js";
import { noStore } from "../middleware/noStore.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { competitionIdParamsSchema } from "../schemas/gymAdminSchemas.js";
import { leaderboardQuerySchema } from "../schemas/leaderboardSchemas.js";

/**
 * Routes under /api/leaderboards, the public leaderboards (US-020 criteria 5 and 6). They need no
 * login, so a Visitor or a display screen can follow a competition whose Gym Admin made its
 * leaderboard public.
 *
 * GET /:competitionId: the standings, by division, optionally only one (?divisionId=).
 *
 * There's only this one read route: nothing here creates, changes or deletes anything, and a public
 * answer carries no Climber IDs or management settings, so public access gives no
 * competition-management permissions. Requests are limited per IP address.
 *
 * @returns {import("express").Router} The router.
 */
export function createLeaderboardRoutes() {
  const router = Router();

  router.get(
    "/:competitionId",
    hourlyRateLimit(
      PUBLIC_LEADERBOARD_LIMIT_PER_HOUR,
      "Too many leaderboard requests from this network. Please try again later.",
    ),
    noStore,
    validateParams(competitionIdParamsSchema),
    validateQuery(leaderboardQuerySchema),
    leaderboardController.getPublicLeaderboard,
  );

  return router;
}
