import { getAdminDashboardSummary } from "../services/adminDashboardService.js";

/**
 * Returns counts on the System Administrator dashboard.
 */
export async function getDashboardSummary(req, res) {
  res.json(await getAdminDashboardSummary());
}
