import * as leaderboardService from "../services/leaderboardService.js";

/**
 * GET /api/gym-admin/competitions/:competitionId/leaderboard (US-020 criterion 1). Answers the
 * standings of one of the Gym Admin's competitions, by division, with Climber IDs and the public
 * access setting.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getManagedLeaderboard(req, res) {
  res.json(
    await leaderboardService.getManagedLeaderboard(
      res.locals.gyms,
      res.locals.params.competitionId,
      res.locals.query,
    ),
  );
}

/**
 * GET /api/competitions/:competitionId/leaderboard (US-020 criterion 4, US-032). Answers the
 * standings with the logged-in Climber's own place as myEntry.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getClimberLeaderboard(req, res) {
  res.json(
    await leaderboardService.getClimberLeaderboard(
      req.auth.userId,
      res.locals.params.competitionId,
      res.locals.query,
    ),
  );
}

/**
 * GET /api/leaderboards/:competitionId (US-020 criteria 5 and 6). Answers a public leaderboard to
 * anyone, without logging in, or 403 LEADERBOARD_NOT_PUBLIC.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getPublicLeaderboard(req, res) {
  res.json(
    await leaderboardService.getPublicLeaderboard(
      res.locals.params.competitionId,
      res.locals.query,
    ),
  );
}
