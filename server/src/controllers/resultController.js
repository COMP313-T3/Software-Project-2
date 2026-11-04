import * as resultService from "../services/officialResultService.js";

/**
 * GET /api/gym-admin/competitions/:competitionId/results/options (US-019 criteria 1 and 2).
 * Answers { competition, scoring, canRecord, climbers, routes }: the Climbers with a confirmed
 * registration and the competition's problems to choose from, the scoring rules, and whether
 * results can be recorded yet.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getEntryOptions(req, res) {
  res.json(await resultService.getEntryOptions(res.locals.gyms, res.locals.params.competitionId));
}

/**
 * GET /api/gym-admin/competitions/:competitionId/results (US-019). Answers
 * { results, total, page, limit }, filtered by the validated query in res.locals.query.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listResults(req, res) {
  res.json(
    await resultService.listResults(
      res.locals.gyms,
      res.locals.params.competitionId,
      res.locals.query,
    ),
  );
}

/**
 * GET .../competitions/:competitionId/climbers/:climberId/routes/:routeId/result (US-019).
 * Answers the Climber's result on the problem, with result null until one is saved.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getResult(req, res) {
  res.json(await resultService.getResult(res.locals.gyms, res.locals.params));
}

/**
 * PUT .../competitions/:competitionId/climbers/:climberId/routes/:routeId/result (US-019
 * criteria 3 to 6). Saves the whole result and answers 201 when it's the first one for this
 * Climber and problem, or 200 when it replaced one. The Gym Admin is always the one in the access
 * token.
 *
 * @param {import("express").Request} req Request whose body passed saveResultSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function saveResult(req, res) {
  const saved = await resultService.saveResult(
    res.locals.gyms,
    res.locals.params,
    req.auth,
    req.body,
  );
  res.status(saved.created ? 201 : 200).json(saved);
}

/**
 * POST .../competitions/:competitionId/climbers/:climberId/routes/:routeId/attempts (US-019
 * criteria 3, 4 and 6). Records one more attempt, sent or not, and answers 201 with the result.
 *
 * @param {import("express").Request} req Request whose body passed recordAttemptSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function recordAttempt(req, res) {
  res
    .status(201)
    .json(
      await resultService.recordAttempt(res.locals.gyms, res.locals.params, req.auth, req.body),
    );
}

/**
 * DELETE .../competitions/:competitionId/climbers/:climberId/routes/:routeId/result (US-019).
 * Deletes the result and answers { message, climberTotal }.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function deleteResult(req, res) {
  res.json(await resultService.deleteResult(res.locals.gyms, res.locals.params, req.auth));
}
