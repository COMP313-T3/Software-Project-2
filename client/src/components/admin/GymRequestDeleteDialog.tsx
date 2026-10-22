import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../lib/apiClient.ts";
import {
  deleteGymRequest,
  type GymRequestDetails,
} from "../../lib/gymRequestReviewApi.ts";
import { isOutdated, isUncertain } from "./gymRequestErrors.ts";
import styles from "./GymRequestReview.module.css";

interface GymRequestDeleteDialogProps {
  /** A rejected request, or a pending one without contact details. */
  request: GymRequestDetails;
  /**
   * Called when the dialog closes without deleting. reload is true after a try that failed in a
   * way that may still have deleted the request, such as a lost connection.
   */
  onCancel: (reload: boolean) => void;
  /** Called with the API's message once the request is deleted. */
  onDeleted: (message: string) => void;
  /**
   * Called when the API refuses because the request changed or no longer exists. The page reloads
   * it.
   */
  onOutdated: (error: ApiError) => void;
}

function deleteProblem(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message;
  return "We couldn't confirm the request was deleted. Check your connection, then try again.";
}

/**
 * Asks the System Administrator to confirm before a gym request is deleted. While it's being
 * deleted, the confirm button ignores more clicks and the dialog stays open, even when the
 * browser closes it on a repeated Esc. Focus starts on Cancel and goes back to the button that
 * opened the dialog when it closes without deleting.
 */
export default function GymRequestDeleteDialog({
  request,
  onCancel,
  onDeleted,
  onOutdated,
}: GymRequestDeleteDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const closingOnPurpose = useRef(false);
  const deleting = useRef(false);
  const uncertain = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const { firstName, lastName, email } = request.contact;
  const name =
    [firstName, lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ") || email;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closingOnPurpose.current = false;
    if (!element.open) element.showModal();
    cancelButton.current?.focus();
    return () => {
      closingOnPurpose.current = true;
      if (element.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  async function confirm() {
    if (deleting.current) return;
    deleting.current = true;
    setBusy(true);
    setProblem("");
    try {
      const { message } = await deleteGymRequest(request.requestId);
      onDeleted(message);
    } catch (error) {
      if (isOutdated(error)) {
        onOutdated(error);
        return;
      }
      deleting.current = false;
      if (isUncertain(error)) uncertain.current = true;
      setBusy(false);
      setProblem(deleteProblem(error));
    }
  }

  const summary =
    request.status === "PENDING"
      ? "This request has no contact details, so it can't be approved or rejected. Deleting it removes it from TopSend."
      : "Deleting it removes this rejected request from TopSend. The applicant isn't emailed.";

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-summary ${id}-consequence`}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!deleting.current) onCancel(uncertain.current);
      }}
      onClose={() => {
        if (closingOnPurpose.current || dialog.current?.open !== false) return;
        if (deleting.current) {
          dialog.current?.showModal();
          return;
        }
        onCancel(uncertain.current);
      }}
    >
      <div className={styles.dialogBody}>
        <h2 id={`${id}-title`}>
          {name
            ? `Delete the request from ${name}?`
            : "Delete this request?"}
        </h2>
        <p id={`${id}-summary`}>{summary}</p>
        <p id={`${id}-consequence`}>You can't undo this.</p>
        {problem && (
          <p role="alert" className={styles.problem}>
            {problem}
          </p>
        )}
        <p role="status" className={styles.hidden}>
          {busy ? "Deleting the request…" : ""}
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
          className={styles.reject}
          aria-disabled={busy || undefined}
          onClick={() => void confirm()}
        >
          {busy && <span className={styles.spinner} aria-hidden="true" />}
          {busy ? "Deleting…" : "Delete request"}
        </button>
      </div>
    </dialog>
  );
}
