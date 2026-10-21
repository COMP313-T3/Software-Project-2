import { GYM_REQUEST_STATUS_LABELS } from "../../constants/gymRequests.ts";
import type { GymRequestStatus } from "../../lib/gymRequestReviewApi.ts";
import styles from "./GymRequestStatusBadge.module.css";

/** A gym request's status as a word on a colored pill: Pending, Approved, or Rejected. */
export default function GymRequestStatusBadge({
  status,
}: {
  status: GymRequestStatus;
}) {
  return (
    <span className={styles.badge} data-status={status}>
      {GYM_REQUEST_STATUS_LABELS[status] ?? status}
    </span>
  );
}
