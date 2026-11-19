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
  /** Whether every active System Administrator gets an email about each new access request. */
  accessRequestEmails: boolean;
  /** Failed logins in a row, within 15 minutes, that lock an email, and for how many minutes. */
  failedLoginsBeforeLock: number;
  loginLockMinutes: number;
  /** While it's on, only System Administrators can log in, and sign-ups and access requests wait. */
  maintenanceMode: boolean;
  /** Shown at the top of every logged-in page, and to anyone kept out by maintenance mode. */
  maintenanceMessage: string;
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
