import * as gymService from "../services/gymService.js";
import { gymIdParamsSchema } from "../schemas/gymSchemas.js";
import { validationError } from "../middleware/validateBody.js";

/** The gym ID from the address, checked like the other gym routes' params. */
function parseGymId(params) {
  const result = gymIdParamsSchema.safeParse(params);
  if (!result.success) throw validationError(result.error.issues);
  return result.data.gymId;
}

/**
 * POST /api/gyms (US-004). Registers a gym and answers 201 with it, its map pin as coordinates.
 *
 * @param {import("express").Request} req Request whose body passed createGymSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function createGym(req, res) {
  res.status(201).json(await gymService.createGym(req.body));
}

/**
 * GET /api/gyms (US-004). Answers { gyms, total, page, limit }, filtered by the validated status
 * and page in res.locals.query.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listGyms(req, res) {
  res.json(await gymService.listGyms(res.locals.query));
}

/**
 * GET /api/gyms/:gymId (US-005). Answers the gym with its assigned Gym Administrators.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getGym(req, res) {
  res.json(await gymService.getGymById(parseGymId(req.params)));
}

/**
 * PATCH /api/gyms/:gymId (US-005). Saves the gym's name, location, or map pin, and answers the
 * updated gym.
 *
 * @param {import("express").Request} req Request whose body passed updateGymSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function updateGym(req, res) {
  res.json(await gymService.updateGym(parseGymId(req.params), req.body));
}

/**
 * PATCH /api/gyms/:gymId/deactivate (US-005). Answers the gym, now INACTIVE.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function deactivateGym(req, res) {
  res.json(await gymService.deactivateGym(parseGymId(req.params)));
}

/**
 * PATCH /api/gyms/:gymId/activate (US-005). Answers the gym, now ACTIVE.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function activateGym(req, res) {
  res.json(await gymService.activateGym(parseGymId(req.params)));
}
