import { useState } from "react";
import type { ApiError } from "../../lib/apiClient.ts";
import type {
  GymRequestChoice,
  GymRequestDetails,
  GymRequestReviewResult,
} from "../../lib/gymRequestReviewApi.ts";
import Tooltip from "../common/Tooltip.tsx";
import GymRequestReviewDialog from "./GymRequestReviewDialog.tsx";
import styles from "./GymRequestReview.module.css";

const APPROVE_HINT =
  "You confirm before anything is saved. Approving lets the applicant set up a Gym Administrator account.";
const REJECT_HINT =
  "You confirm before anything is saved, and you can add a reason. No Gym Administrator access is given.";

/**
 * Why an approval would fail, from the checks the API ran when the request was loaded. The API
 * checks again when the decision is sent.
 */
function approvalBlocker({
  status,
  requestType,
  checks,
}: GymRequestDetails): string {
  if (status !== "PENDING" || !checks) return "";
  if (checks.emailHasAccount) {
    return "The applicant's email already has a TopSend account, so a Gym Administrator account can't be set up with it. Reject this request and ask the applicant to apply with another email.";
  }
  if (requestType === "NEW_GYM" && checks.gymAlreadyRegistered) {
    return "A gym with this name and location is already on TopSend. Reject this request and ask the applicant to request access to the registered gym instead.";
  }
  if (requestType === "EXISTING_GYM" && checks.gymRegistered === false) {
    return "The selected gym is no longer registered on TopSend. Reject this request instead.";
  }
  return "";
}

/** Something to know before approving that doesn't stop the approval. */
function approvalNote({
  status,
  requestType,
  checks,
}: GymRequestDetails): string {
  if (
    status !== "PENDING" ||
    requestType !== "EXISTING_GYM" ||
    !checks?.gymRegistered
  )
    return "";
  return checks.gymActive === false
    ? "The selected gym isn't active. If you approve, the applicant can manage its competitions once it's activated."
    : "";
}

interface DecisionButtonProps {
  label: string;
  hint: string;
  className: string;
  disabled: boolean;
  onClick: () => void;
}

/** One decision button. Only an enabled one gets a tooltip, since a disabled one can't be used. */
function DecisionButton({
  label,
  hint,
  className,
  disabled,
  onClick,
}: DecisionButtonProps) {
  if (disabled) {
    return (
      <button type="button" className={className} disabled>
        {label}
      </button>
    );
  }
  return (
    <Tooltip text={hint} focusVisibleOnly>
      {(describedBy) => (
        <button
          type="button"
          className={className}
          aria-describedby={describedBy}
          onClick={onClick}
        >
          {label}
        </button>
      )}
    </Tooltip>
  );
}

interface GymRequestDecisionProps {
  /** The request on the page. */
  request: GymRequestDetails;
  /** Called with the API's answer once a decision is saved. */
  onReviewed: (result: GymRequestReviewResult) => void;
  /**
   * Called when the API refuses the decision because the request changed, so the page can show
   * why and reload it.
   */
  onOutdated: (error: ApiError) => void;
  /** Reloads the request, after a try whose outcome isn't known was cancelled. */
  onRefresh: () => void;
}

/**
 * Approve and Reject controls for one request (US-035 criterion 3). Each opens a confirmation
 * first. Both stay disabled once the request isn't PENDING, and Approve also stays disabled while
 * the API's checks say the approval would fail.
 */
export default function GymRequestDecision({
  request,
  onReviewed,
  onOutdated,
  onRefresh,
}: GymRequestDecisionProps) {
  const [choice, setChoice] = useState<GymRequestChoice | null>(null);
  const pending = request.status === "PENDING";
  const blocker = approvalBlocker(request);
  const note = approvalNote(request);

  return (
    <div className={styles.decision}>
      {blocker && <p className={styles.warning}>{blocker}</p>}
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.actions}>
        <DecisionButton
          label="Approve request"
          hint={APPROVE_HINT}
          className={styles.approve}
          disabled={!pending || Boolean(blocker)}
          onClick={() => setChoice("APPROVE")}
        />
        <DecisionButton
          label="Reject request"
          hint={REJECT_HINT}
          className={styles.reject}
          disabled={!pending}
          onClick={() => setChoice("REJECT")}
        />
      </div>
      <p className={styles.help}>
        {!pending
          ? `This request was ${request.status === "APPROVED" ? "approved" : "rejected"}. Only pending requests can be approved or rejected.`
          : blocker
            ? "Reject asks you to confirm first. A decision can't be undone."
            : "Both ask you to confirm first. A decision can't be undone."}
      </p>
      {choice && (
        <GymRequestReviewDialog
          choice={choice}
          request={request}
          onCancel={(reload) => {
            setChoice(null);
            if (reload) onRefresh();
          }}
          onReviewed={(result) => {
            setChoice(null);
            onReviewed(result);
          }}
          onOutdated={(error) => {
            setChoice(null);
            onOutdated(error);
          }}
        />
      )}
    </div>
  );
}
