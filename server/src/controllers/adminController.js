import { getAdminDashboardSummary } from "../services/adminDashboardService.js";
import {
  deactivateUser as deactivateUserAccount,
  updateUser as updateUserAccount,
} from "../services/adminUserService.js";

/**
 * GET /api/admin/dashboard (US-003). Answers the gym, user, and pending request counts for the
 * System Administrator dashboard.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getDashboardSummary(req, res) {
  res.json(await getAdminDashboardSummary());
}

/**
 * Deactivates an eligible account selected by a System Administrator.
 */
export async function deactivateUser(req, res) {
  res.json(
    await deactivateUserAccount(res.locals.params.userId, req.auth.userId),
  );
}

/**
 * Updates permitted profile information for a user selected by a System Administrator.
 */
export async function updateUser(req, res) {
  res.json(
    await updateUserAccount(res.locals.params.userId, req.body),
  );
}
