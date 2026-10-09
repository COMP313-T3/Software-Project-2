import { z } from "zod";
import * as gymAdminService from "../services/gymAdminService.js";
import { validationError } from "../middleware/validateBody.js";

const assignmentParams = z.object({
  gymId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid gym id."),
  userId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid user id."),
});

function parseIds(params) {
  const parsed = assignmentParams.safeParse(params);
  if (!parsed.success) throw validationError(parsed.error.issues);
  return parsed.data;
}

/** PUT /api/gyms/:gymId/admins/:userId (US-006 #6.1).
 * gymRoutes.createGymRoutes checks session and ADMIN before this controller.
 * Delegates approval, account validation and atomic persistence to
 * gymAdminService.assignGymAdmin. Returns the same populated gym shape as US-005.
 */
export async function assignGymAdmin(req, res) {
  const { gymId, userId } = parseIds(req.params);
  res.json(await gymAdminService.assignGymAdmin(gymId, userId));
}

/** DELETE /api/gyms/:gymId/admins/:userId (US-006 #6.2).
 * Delegates scoped relationship removal to gymAdminService.removeGymAdmin;
 * no request-body role, approval status or admin list is accepted.
 */
export async function removeGymAdmin(req, res) {
  const { gymId, userId } = parseIds(req.params);
  res.json(await gymAdminService.removeGymAdmin(gymId, userId));
}
