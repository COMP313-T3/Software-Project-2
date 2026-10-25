import * as dashboardService from "../services/gymAdminDashboardService.js";

/**
 * GET /api/gym-admin/dashboard (US-011). Answers { gyms, counts: { upcoming, past, drafts },
 * upcoming }: the user's active gyms and their next few competitions. requireGymAdmin has
 * already put the user's gyms in res.locals.gyms.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getDashboard(req, res) {
  res.json(await dashboardService.getDashboard(res.locals.gyms));
}

/**
 * GET /api/gym-admin/competitions (US-011). Answers { competitions, total, page, limit } for
 * the user's gyms only, filtered by the validated query in res.locals.query.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listCompetitions(req, res) {
  res.json(
    await dashboardService.listCompetitions(res.locals.gyms, res.locals.query),
  );
}

/**
 * GET /api/gym-admin/competitions/:competitionId (US-011). Answers one of the user's gym's
 * competitions with its management tools, or 404 COMPETITION_NOT_FOUND.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getCompetition(req, res) {
  res.json(
    await dashboardService.getCompetition(
      res.locals.gyms,
      res.locals.params.competitionId,
    ),
  );
}
