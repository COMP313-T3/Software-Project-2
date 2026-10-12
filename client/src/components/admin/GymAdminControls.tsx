import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GymAdministrator } from "../../lib/gymsApi.ts";
import GymAdminDisplay from "./GymAdminDisplay.tsx";
import styles from "./GymAdminControls.module.css";
import pageStyles from "../../pages/GymsPage.module.css";

interface Props {
  administrators: GymAdministrator[];
  /** Accounts approved for this gym and not assigned yet, or null while they load. */
  candidates: GymAdministrator[] | null;
  candidatesError: string;
  gymName: string;
  disabled: boolean;
  pending: "assign" | "remove" | null;
  error: string;
  notice: string;
  onAssign: (userId: string) => Promise<boolean>;
  onRemove: (userId: string) => Promise<boolean>;
  onRetryCandidates: () => void;
  onOpenDetails: (administrator: GymAdministrator) => void;
  onClearFeedback: () => void;
}

function displayName(admin: GymAdministrator) {
  return [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email;
}

/**
 * Assign and remove controls for a gym's Gym Administrators (US-006, FR-003). The Admin picks
 * from the accounts approved for this gym; the parent page saves each change and only shows what
 * the server confirmed.
 */
export default function GymAdminControls({
  administrators, candidates, candidatesError, gymName, disabled, pending, error, notice,
  onAssign, onRemove, onRetryCandidates, onOpenDetails, onClearFeedback,
}: Props) {
  const [userId, setUserId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [target, setTarget] = useState<GymAdministrator | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const wasConfirming = useRef(false);
  const wasAssigning = useRef(false);
  const noneWaiting = candidates !== null && candidates.length === 0;

  useEffect(() => {
    if (target) confirmButton.current?.focus();
    else if (wasConfirming.current) {
      (removeTrigger.current?.isConnected ? removeTrigger.current : select.current)?.focus();
    }
    wasConfirming.current = Boolean(target);
  }, [target]);

  useEffect(() => {
    if (wasAssigning.current && pending !== "assign" && !disabled) select.current?.focus();
    wasAssigning.current = pending === "assign";
  }, [pending, disabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || target) return;
    const message = !userId ? "Choose a Gym Administrator to assign."
      : administrators.some(admin => admin.userId === userId)
        ? "That administrator is already assigned to this gym." : "";
    setFieldError(message);
    if (message) { select.current?.focus(); return; }
    if (await onAssign(userId)) { setUserId(""); select.current?.focus(); }
  }

  async function confirmRemoval() {
    if (disabled || !target) return;
    if (await onRemove(target.userId)) setTarget(null);
  }

  return <GymAdminDisplay administrators={administrators} onOpen={onOpenDetails} renderAction={admin => (
    <button type="button" className={styles.remove} disabled={disabled || Boolean(target)}
      aria-label={`Remove ${displayName(admin)} from this gym`}
      onClick={event => { removeTrigger.current = event.currentTarget; setTarget(admin); setFieldError(""); onClearFeedback(); }}>
      Remove
    </button>
  )}>
    <form onSubmit={event => void submit(event)} noValidate aria-label="Assign Gym Administrator"
      aria-busy={pending === "assign"} className={styles.form}>
      <label htmlFor="gym-admin-candidate">Gym Administrator to assign</label>
      <p id="gym-admin-help" className={styles.help}>
        {candidates === null && !candidatesError ? "Loading the accounts approved for this gym…"
          : noneWaiting ? "No approved Gym Administrator accounts are waiting for this gym."
            : "Accounts approved for this gym that aren't assigned yet."}
      </p>
      <select id="gym-admin-candidate" ref={select} value={userId} required
        disabled={disabled || Boolean(target)}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={`gym-admin-help${fieldError ? " gym-admin-candidate-error" : ""}`}
        onChange={event => { setUserId(event.target.value); setFieldError(""); onClearFeedback(); }}>
        <option value="">Choose an approved account</option>
        {candidates?.map(candidate => (
          <option key={candidate.userId} value={candidate.userId}>
            {displayName(candidate)} ({candidate.email})
          </option>
        ))}
      </select>
      {fieldError && <p id="gym-admin-candidate-error" role="alert" className={pageStyles.fieldError}>{fieldError}</p>}
      {candidatesError && <div role="alert" className={`${pageStyles.error} ${styles.candidatesError}`}>
        <p>{candidatesError}</p>
        <button type="button" onClick={onRetryCandidates}>Try again</button>
      </div>}
      <button type="submit" className={pageStyles.primary} disabled={disabled || Boolean(target)}>
        {pending === "assign" ? "Assigning…" : "Assign administrator"}
      </button>
    </form>
    <div role="status" aria-live="polite">{notice && <p className={pageStyles.success}>{notice}</p>}</div>
    {error && <p role="alert" className={pageStyles.error}>{error}</p>}
    {target && <div className={styles.confirmation} role="group" aria-label="Confirm administrator removal" aria-busy={pending === "remove"}>
      <p id="gym-admin-removal-question"><strong>Remove {displayName(target)} from {gymName}?</strong></p>
      <p>This removes their assignment to this gym. Their account and other gym assignments are kept.</p>
      <div className={styles.actions}>
        <button type="button" ref={confirmButton} className={styles.remove} aria-describedby="gym-admin-removal-question"
          disabled={disabled} onClick={() => void confirmRemoval()}>{pending === "remove" ? "Removing…" : "Confirm removal"}</button>
        <button type="button" disabled={disabled} onClick={() => { setTarget(null); onClearFeedback(); }}>Cancel removal</button>
      </div>
    </div>}
  </GymAdminDisplay>;
}
