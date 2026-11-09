import { deleteOwnResult, saveOwnResult } from "../services/officialResultService.js";
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

/**
 * PUT /api/competitions/:competitionId/scorecard/routes/:routeId/result (US-031). Saves the
 * logged-in Climber's own result on the problem, then answers their updated scorecard.
 *
 * @param {import("express").Request} req Request with req.auth and the validated body.
 * @param {import("express").Response} res Outgoing response.
 */
export async function saveMyResult(req, res) {
  const { competitionId, routeId } = res.locals.params;
  const { created } = await saveOwnResult(req.auth, { competitionId, routeId }, req.body);
  res.status(created ? 201 : 200).json(await loadScorecard(req.auth.userId, competitionId));
}

/**
 * DELETE /api/competitions/:competitionId/scorecard/routes/:routeId/result (US-031). Clears the
 * logged-in Climber's own result on the problem, then answers their updated scorecard.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function clearMyResult(req, res) {
  const { competitionId, routeId } = res.locals.params;
  await deleteOwnResult(req.auth, { competitionId, routeId });
  res.json(await loadScorecard(req.auth.userId, competitionId));
}
