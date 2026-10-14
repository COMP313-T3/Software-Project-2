import * as routeService from "../services/routeService.js";

/**
 * POST /api/gym-admin/competitions/:competitionId/routes (US-016). Creates an official route
 * for one of the Gym Admin's competitions and answers 201 with its identifier and grade.
 *
 * @param {import("express").Request} req Request whose body passed createRouteSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function createRoute(req, res) {
  const route = await routeService.createRoute(
    res.locals.gyms,
    res.locals.params.competitionId,
    req.auth.userId,
    req.body,
  );
  res.status(201).json(route);
}
