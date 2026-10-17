import * as scoringService from "../services/scoringService.js";

/**
 * GET /api/gym-admin/scoring-formats (US-018). Answers { formats }: the scoring formats TopSend
 * supports, with a label and description for each.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export function listScoringFormats(req, res) {
  res.json(scoringService.listScoringFormats());
}

/**
 * GET /api/gym-admin/competitions/:competitionId/scoring (US-018). Answers
 * { competitionId, scoring, readiness }, where scoring is null until a format is chosen and
 * readiness lists what's still missing before results can be entered.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getScoring(req, res) {
  res.json(
    await scoringService.getScoring(res.locals.gyms, res.locals.params.competitionId),
  );
}

/**
 * PUT /api/gym-admin/competitions/:competitionId/scoring (US-018). Saves the competition's
 * scoring format and answers the same shape as GET. Fails with 409 COMPETITION_CANCELLED or
 * COMPETITION_FINISHED when the scoring can no longer change.
 *
 * @param {import("express").Request} req Request whose body passed scoringSettingsSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function setScoring(req, res) {
  res.json(
    await scoringService.setScoring(
      res.locals.gyms,
      res.locals.params.competitionId,
      req.auth.userId,
      req.body,
    ),
  );
}
