import type { GymStatus } from "../lib/gymsApi.ts";

/** How each stored gym status reads on screen. */
export const GYM_STATUS_LABELS: Record<GymStatus, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  INACTIVE: "Inactive",
};
