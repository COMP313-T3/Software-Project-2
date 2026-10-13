import * as divisionService from "../services/divisionService.js";

/**
 * GET /api/gym-admin/competitions/:competitionId/divisions (US-014). Answers { divisions }, each
 * with its climberCount, for one of the user's competitions.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listDivisions(req, res) {
  res.json(
    await divisionService.listDivisions(
      res.locals.gyms,
      res.locals.params.competitionId,
    ),
  );
}

/**
 * POST /api/gym-admin/competitions/:competitionId/divisions (US-014). Answers 201 with the new
 * division, or 409 DIVISION_EXISTS.
 *
 * @param {import("express").Request} req Request whose body passed createDivisionSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function createDivision(req, res) {
  const division = await divisionService.createDivision(
    res.locals.gyms,
    res.locals.params.competitionId,
    req.auth.userId,
    req.body,
  );
  res.status(201).json(division);
}

/**
 * GET /api/gym-admin/competitions/:competitionId/climbers (US-014). Answers { climbers, total }:
 * the competition's registrations with each Climber's name, email, status, and division.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listClimbers(req, res) {
  res.json(
    await divisionService.listClimbers(
      res.locals.gyms,
      res.locals.params.competitionId,
      res.locals.query,
    ),
  );
}

/**
 * PUT /api/gym-admin/competitions/:competitionId/climbers/:climberId/division (US-014). Places
 * or moves a registered Climber into one of the competition's divisions, and answers their
 * registration. Sending the division they're already in changes nothing and answers the same.
 *
 * @param {import("express").Request} req Request whose body passed divisionAssignmentSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function assignDivision(req, res) {
  const { competitionId, climberId } = res.locals.params;
  res.json(
    await divisionService.assignDivision(
      res.locals.gyms,
      competitionId,
      climberId,
      req.body.divisionId,
      req.auth.userId,
    ),
  );
}
