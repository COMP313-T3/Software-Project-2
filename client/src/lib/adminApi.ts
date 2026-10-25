import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** Counts returned by GET /api/admin/dashboard, as defined in the API contract. */
export interface AdminDashboardSummary {
  gyms: { total: number; active: number; pending: number; inactive: number };
  users: { total: number; admins: number; gymAdmins: number; climbers: number };
  pendingRequests: { total: number; newGyms: number; existingGyms: number };
}

/** Loads the admin overview using the in-memory login token, refreshing it when needed. */
export function fetchAdminDashboard(
  signal?: AbortSignal,
): Promise<AdminDashboardSummary> {
  return withAccessToken((token) =>
    apiRequest<AdminDashboardSummary>("/api/admin/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  );
}
