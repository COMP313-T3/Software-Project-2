import { useRef, useState } from "react";
import { ApiError } from "../../lib/apiClient.ts";
import {
  sendNewSetupLink,
  type GymRequestChoice,
  type GymRequestDetails,
  type GymRequestReviewResult,
} from "../../lib/gymRequestReviewApi.ts";
import Tooltip from "../common/Tooltip.tsx";
import GymRequestDeleteDialog from "./GymRequestDeleteDialog.tsx";
import { isOutdated } from "./gymRequestErrors.ts";
import GymRequestReviewDialog from "./GymRequestReviewDialog.tsx";
import styles from "./GymRequestReview.module.css";

const APPROVE_HINT =
  "You confirm before anything is saved. Approving lets the applicant set up a Gym Administrator account.";
const REJECT_HINT =
  "You confirm before anything is saved, and you can add a reason. No Gym Administrator access is given.";
const DELETE_HINT =
  "You confirm before anything is deleted. A deleted request can't be restored.";
const SETUP_LINK_HINT =
  "Emails the applicant a new link that works for 7 days. Older links stop working.";
const CONTACT_MISSING =
  "This request has no contact details, so it can't be approved or rejected. Delete it instead.";

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
  if (checks.contactMissing) return CONTACT_MISSING;
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

/** What the help line under the buttons says for the request's status. */
function helpText(
  request: GymRequestDetails,
  blocker: string,
  incomplete: boolean,
): string {
  if (request.status === "APPROVED") {
    return "This request was approved. Only pending requests can be approved or rejected.";
  }
  if (request.status === "REJECTED") {
    const rejected =
      "This request was rejected. Only pending requests can be approved or rejected.";
    return request.deletable
      ? `${rejected} You can delete it once you no longer need it.`
      : rejected;
  }
  if (incomplete) {
    return "Delete asks you to confirm first. A deleted request can't be restored.";
  }
  return blocker
    ? "Reject asks you to confirm first. A decision can't be undone."
    : "Both ask you to confirm first. A decision can't be undone.";
}

function setupLinkProblem(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return "We couldn't reach TopSend, so the new link may not have been sent. Check your connection, then try again.";
}

interface GymRequestDecisionProps {
  /** The request on the page. */
  request: GymRequestDetails;
  /** Called with the API's answer once a decision is saved or a new setup link is sent. */
  onReviewed: (result: GymRequestReviewResult) => void;
  /**
   * Called when the API refuses because the request changed, so the page can show why and reload
   * it.
   */
  onOutdated: (error: ApiError) => void;
  /** Reloads the request, after a try whose outcome isn't known was cancelled. */
  onRefresh: () => void;
  /** Called with the API's message once the request is deleted. */
  onDeleted: (message: string) => void;
}

/**
 * Approve and Reject controls for one request (US-035 criterion 3). Each opens a confirmation
 * first. Both stay disabled once the request isn't PENDING, and Approve also stays disabled while
 * the API's checks say the approval would fail. A request without contact details can't be
 * reviewed, so both stay disabled for it too. A rejected request, or a pending one without
 * contact details, can be deleted after a confirmation. An approved applicant who hasn't set up
 * their account can be sent a new setup link (US-035 criterion 6).
 */
export default function GymRequestDecision({
  request,
  onReviewed,
  onOutdated,
  onRefresh,
  onDeleted,
}: GymRequestDecisionProps) {
  const [choice, setChoice] = useState<GymRequestChoice | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkProblem, setLinkProblem] = useState("");
  const sending = useRef(false);
  const pending = request.status === "PENDING";
  const incomplete = pending && request.checks?.contactMissing === true;
  const blocker = approvalBlocker(request);
  const note = approvalNote(request);
  const canSendLink =
    request.status === "APPROVED" &&
    request.accountSetup?.completed === false &&
    Boolean(request.contact.email);

  async function sendLink() {
    if (sending.current) return;
    sending.current = true;
    setSendingLink(true);
    setLinkProblem("");
    try {
      onReviewed(await sendNewSetupLink(request.requestId));
    } catch (error) {
      if (isOutdated(error)) onOutdated(error);
      else setLinkProblem(setupLinkProblem(error));
    } finally {
      sending.current = false;
      setSendingLink(false);
    }
  }

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
          disabled={!pending || incomplete}
          onClick={() => setChoice("REJECT")}
        />
        {request.deletable && (
          <DecisionButton
            label="Delete request"
            hint={DELETE_HINT}
            className={styles.reject}
            disabled={false}
            onClick={() => setConfirmingDelete(true)}
          />
        )}
        {canSendLink && (
          <Tooltip text={SETUP_LINK_HINT} focusVisibleOnly>
            {(describedBy) => (
              <button
                type="button"
                className={styles.withSpinner}
                aria-describedby={describedBy}
                aria-disabled={sendingLink || undefined}
                onClick={() => void sendLink()}
              >
                {sendingLink && (
                  <span className={styles.spinner} aria-hidden="true" />
                )}
                {sendingLink ? "Sending link…" : "Send a new setup link"}
              </button>
            )}
          </Tooltip>
        )}
      </div>
      {linkProblem && (
        <p role="alert" className={styles.warning}>
          {linkProblem}
        </p>
      )}
      <p className={styles.help}>{helpText(request, blocker, incomplete)}</p>
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
      {confirmingDelete && (
        <GymRequestDeleteDialog
          request={request}
          onCancel={(reload) => {
            setConfirmingDelete(false);
            if (reload) onRefresh();
          }}
          onDeleted={onDeleted}
          onOutdated={(error) => {
            setConfirmingDelete(false);
            onOutdated(error);
          }}
        />
      )}
    </div>
  );
}
