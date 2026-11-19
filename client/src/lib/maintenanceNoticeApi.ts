import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** What every logged-in page shows at its top while System Administrators have set it (US-010). */
export interface MaintenanceNotice {
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

/** Gets the maintenance notice: whether maintenance mode is on, and the System Administrators' message. */
export function getMaintenanceNotice(signal?: AbortSignal): Promise<MaintenanceNotice> {
  return withAccessToken((token) =>
    apiRequest<MaintenanceNotice>("/api/session/notice", {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  );
}
