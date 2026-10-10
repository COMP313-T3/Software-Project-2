import * as competitionService from "../services/competitionService.js";

/**
 * POST /api/gym-admin/competitions (US-012). Creates a competition for one of the user's gyms
 * from the validated body, and answers 201 with it, shaped like
 * GET /api/gym-admin/competitions/:competitionId. requireGymAdmin has already put the user's
 * active gyms in res.locals.gyms, so the gym is chosen from those, never from the client alone.
 *
 * @param {import("express").Request} req Request whose body passed createCompetitionSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function createCompetition(req, res) {
  const competition = await competitionService.createCompetition(
    res.locals.gyms,
    req.auth.userId,
    req.body,
  );
  res.status(201).json(competition);
}
