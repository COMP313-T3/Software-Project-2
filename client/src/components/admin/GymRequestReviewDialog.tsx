import { useEffect, useId, useRef, useState } from "react";
import { GYM_REQUEST_REJECTION_REASON_MAX_LENGTH } from "../../constants/gymRequests.ts";
import { ApiError } from "../../lib/apiClient.ts";
import {
  reviewGymRequest,
  type GymRequestChoice,
  type GymRequestDetails,
  type GymRequestReviewResult,
} from "../../lib/gymRequestReviewApi.ts";
import { applicantName } from "./gymRequestText.ts";
import styles from "./GymRequestReview.module.css";

interface GymRequestReviewDialogProps {
  /** The decision to confirm. */
  choice: GymRequestChoice;
  /** The PENDING request being reviewed. */
  request: GymRequestDetails;
  /**
   * Called when the dialog closes without a decision. reload is true after a try that failed in a
   * way that may still have saved the decision, such as a lost connection.
   */
  onCancel: (reload: boolean) => void;
  /** Called with the API's answer once the decision is saved. */
  onReviewed: (result: GymRequestReviewResult) => void;
  /**
   * Called when the API refuses the decision because the request changed: it was already
   * reviewed, an approval check now fails, or it no longer exists. The page reloads it.
   */
  onOutdated: (error: ApiError) => void;
}

function isOutdated(error: unknown): error is ApiError {
  return (
    error instanceof ApiError && (error.status === 404 || error.status === 409)
  );
}

/** A lost connection or a server error leaves it unknown whether the decision was saved. */
function isUncertain(error: unknown): boolean {
  return (
    !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  );
}

function saveProblem(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) {
    return "We couldn't confirm your decision with TopSend. Check your connection, then try again.";
  }
  return error instanceof ApiError
    ? error.message
    : "Couldn't save your decision. Please try again.";
}

/**
 * Asks the System Administrator to confirm an approval or a rejection before it's sent (US-035
 * criterion 3). A rejection can carry an optional reason for the applicant. While the decision is
 * being saved, the confirm button ignores more clicks and the dialog stays open, even when the
 * browser closes it on a repeated Esc, so the decision is sent once. Focus starts on Cancel for an
 * approval and on the reason for a rejection, and goes back to the button that opened the dialog
 * when it closes without a decision.
 */
export default function GymRequestReviewDialog({
  choice,
  request,
  onCancel,
  onReviewed,
  onOutdated,
}: GymRequestReviewDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const closingOnPurpose = useRef(false);
  const saving = useRef(false);
  const uncertain = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const approving = choice === "APPROVE";
  const name = applicantName(request.contact);
  const firstName = request.contact.firstName.trim() || "The applicant";
  const gymName = request.gym?.name || request.proposedGym?.name || "this gym";
  const maxLength = GYM_REQUEST_REJECTION_REASON_MAX_LENGTH;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closingOnPurpose.current = false;
    if (!element.open) element.showModal();
    (approving ? cancelButton.current : reasonField.current)?.focus();
    return () => {
      closingOnPurpose.current = true;
      if (element.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [approving]);

  async function confirm() {
    if (saving.current) return;
    const trimmed = reason.trim();
    if (!approving && trimmed.length > maxLength) {
      setReasonError(`Use ${maxLength} characters or fewer.`);
      reasonField.current?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    setProblem("");
    setReasonError("");
    try {
      const result = await reviewGymRequest(
        request.requestId,
        approving
          ? { decision: "APPROVE" }
          : { decision: "REJECT", reason: trimmed || undefined },
      );
      onReviewed(result);
    } catch (error) {
      if (isOutdated(error)) {
        onOutdated(error);
        return;
      }
      saving.current = false;
      if (isUncertain(error)) uncertain.current = true;
      setBusy(false);
      const fieldMessage =
        error instanceof ApiError ? error.fields?.reason : undefined;
      if (!approving && fieldMessage) {
        setReasonError(fieldMessage);
        reasonField.current?.focus();
      } else {
        setProblem(saveProblem(error));
      }
    }
  }

  const summary = approving
    ? request.requestType === "NEW_GYM"
      ? `This registers ${gymName} as an active gym on TopSend and lets ${name} set up a Gym Administrator account for it.`
      : `This lets ${name} set up a Gym Administrator account for ${gymName}.`
    : request.requestType === "NEW_GYM"
      ? `${gymName} won't be registered, and ${name} won't get Gym Administrator access.`
      : `${name} won't get Gym Administrator access for ${gymName}.`;
  const consequence = approving
    ? `${firstName} gets access only after setting up the account. You can't undo an approval.`
    : "You can't undo a rejection.";
  const reasonDescription = [
    `${id}-reason-hint`,
    `${id}-reason-count`,
    reasonError ? `${id}-reason-error` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-summary ${id}-consequence`}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving.current) onCancel(uncertain.current);
      }}
      onClose={() => {
        if (closingOnPurpose.current || dialog.current?.open !== false) return;
        if (saving.current) {
          dialog.current?.showModal();
          return;
        }
        onCancel(uncertain.current);
      }}
    >
      <div className={styles.dialogBody}>
        <h2 id={`${id}-title`}>
          {approving
            ? `Approve the request from ${name}?`
            : `Reject the request from ${name}?`}
        </h2>
        <p id={`${id}-summary`}>{summary}</p>
        <p id={`${id}-consequence`}>{consequence}</p>
        {!approving && (
          <div className={styles.field}>
            <label htmlFor={`${id}-reason`}>
              Reason for rejecting (optional)
            </label>
            <p id={`${id}-reason-hint`} className={styles.hint}>
              The applicant sees this in the email about your decision.
            </p>
            <textarea
              id={`${id}-reason`}
              ref={reasonField}
              value={reason}
              rows={4}
              maxLength={maxLength}
              readOnly={busy}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonDescription}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError("");
              }}
            />
            <p id={`${id}-reason-count`} className={styles.count}>
              {reason.length} of {maxLength} characters
            </p>
            {reasonError && (
              <p
                id={`${id}-reason-error`}
                role="alert"
                className={styles.fieldError}
              >
                {reasonError}
              </p>
            )}
          </div>
        )}
        {problem && (
          <p role="alert" className={styles.problem}>
            {problem}
          </p>
        )}
        <p role="status" className={styles.hidden}>
          {busy ? "Saving your decision…" : ""}
        </p>
      </div>
      <div className={styles.dialogActions}>
        <button
          ref={cancelButton}
          type="button"
          disabled={busy}
          onClick={() => onCancel(uncertain.current)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={approving ? styles.approve : styles.reject}
          aria-disabled={busy || undefined}
          onClick={() => void confirm()}
        >
          {busy && <span className={styles.spinner} aria-hidden="true" />}
          {busy
            ? approving
              ? "Approving…"
              : "Rejecting…"
            : approving
              ? "Approve request"
              : "Reject request"}
        </button>
      </div>
    </dialog>
  );
}
