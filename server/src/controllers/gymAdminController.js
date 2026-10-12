import { z } from "zod";
import * as gymAdminService from "../services/gymAdminService.js";
import { validationError } from "../middleware/validateBody.js";

const assignmentParams = z.object({
  gymId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid gym id."),
  userId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid user id."),
});
const gymIdParams = assignmentParams.pick({ gymId: true });

function parseIds(params) {
  const parsed = assignmentParams.safeParse(params);
  if (!parsed.success) throw validationError(parsed.error.issues);
  return parsed.data;
}

/**
 * PUT /api/gyms/:gymId/admins/:userId (US-006). Assigns the account to the gym and answers the
 * gym with its administrators, in the same shape as GET /api/gyms/:gymId.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function assignGymAdmin(req, res) {
  const { gymId, userId } = parseIds(req.params);
  res.json(await gymAdminService.assignGymAdmin(gymId, userId));
}

/**
 * DELETE /api/gyms/:gymId/admins/:userId (US-006). Removes the account from the gym and answers
 * the gym with its remaining administrators. No body is read.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function removeGymAdmin(req, res) {
  const { gymId, userId } = parseIds(req.params);
  res.json(await gymAdminService.removeGymAdmin(gymId, userId));
}

/**
 * GET /api/gyms/:gymId/admin-candidates (US-006). Answers { candidates }: the accounts approved
 * for this gym that can be assigned to it.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listAdminCandidates(req, res) {
  const parsed = gymIdParams.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.issues);
  res.json({
    candidates: await gymAdminService.listAdminCandidates(parsed.data.gymId),
  });
}

/**
 * GET /api/gyms/:gymId/admins/:userId (US-006). Answers one of the gym's Gym Administrators
 * with every gym they administer.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getGymAdmin(req, res) {
  const { gymId, userId } = parseIds(req.params);
  res.json(await gymAdminService.getGymAdmin(gymId, userId));
}
