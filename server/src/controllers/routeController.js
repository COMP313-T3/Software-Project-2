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

/**
 * GET /api/gym-admin/competitions/:competitionId/routes (US-016, US-017). Answers
 * { routes, total }: every route of one of the Gym Admin's competitions, by route number.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listRoutes(req, res) {
  res.json(
    await routeService.listRoutes(
      res.locals.gyms,
      res.locals.params.competitionId,
    ),
  );
}

/** GET /api/gym-admin/competitions/:competitionId/routes/:routeId (US-017). */
export async function getRoute(req, res) {
  const route = await routeService.getRoute(
    res.locals.gyms,
    res.locals.params.competitionId,
    res.locals.params.routeId,
  );
  res.json(route);
}

/** PATCH /api/gym-admin/competitions/:competitionId/routes/:routeId (US-017). */
export async function updateRoute(req, res) {
  const route = await routeService.updateRoute(
    res.locals.gyms,
    res.locals.params.competitionId,
    res.locals.params.routeId,
    req.auth.userId,
    req.body,
  );
  res.json(route);
}
