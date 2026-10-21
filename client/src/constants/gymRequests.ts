import type { GymRequestType } from "../lib/gymRequestApi.ts";
import type { GymRequestStatus } from "../lib/gymRequestReviewApi.ts";

/** How each stored gym request status reads on screen. */
export const GYM_REQUEST_STATUS_LABELS: Record<GymRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** How each request type reads on screen. */
export const GYM_REQUEST_TYPE_LABELS: Record<GymRequestType, string> = {
  NEW_GYM: "New gym",
  EXISTING_GYM: "Existing gym access",
};

/** What each request type asks for, in a few words. */
export const GYM_REQUEST_TYPE_DESCRIPTIONS: Record<GymRequestType, string> = {
  NEW_GYM: "Register a gym that isn't on TopSend yet",
  EXISTING_GYM: "Administer a gym already on TopSend",
};

/** Keep aligned with GYM_REQUEST_REJECTION_REASON_MAX_LENGTH in server/src/constants/gymRequests.js. */
export const GYM_REQUEST_REJECTION_REASON_MAX_LENGTH = 500;
