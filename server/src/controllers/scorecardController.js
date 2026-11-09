import { getMyScorecard as loadScorecard } from "../services/scorecardService.js";

/**
 * GET /api/competitions/:competitionId/scorecard (US-031). Answers the logged-in Climber's own
 * scorecard for the competition. The Climber is always the one in the access token; no ID in the
 * request can choose someone else.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getMyScorecard(req, res) {
  res.json(await loadScorecard(req.auth.userId, res.locals.params.competitionId));
}
