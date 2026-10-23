import { getAdminDashboardSummary } from "../services/adminDashboardService.js";

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
