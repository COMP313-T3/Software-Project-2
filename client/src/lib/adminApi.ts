import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** Counts returned by GET /api/admin/dashboard, as defined in the API contract. */
export interface AdminDashboardSummary {
  gyms: { total: number; active: number; pending: number; inactive: number };
  users: { total: number; admins: number; gymAdmins: number; climbers: number };
  pendingRequests: { total: number; newGyms: number; existingGyms: number };
}

export interface SystemSettings {
  platformName: string;
  climberRegistrationEnabled: boolean;
}

export type SystemSettingsChanges = Partial<SystemSettings>;

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

export function fetchSystemSettings(
  signal?: AbortSignal,
): Promise<SystemSettings> {
  return withAccessToken((token) =>
    apiRequest<SystemSettings>("/api/admin/settings", {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

export function saveSystemSettings(
  changes: SystemSettingsChanges,
  signal?: AbortSignal,
): Promise<SystemSettings> {
  return withAccessToken((token) =>
    apiRequest<SystemSettings>("/api/admin/settings", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: changes,
      signal,
    }),
  );
}
