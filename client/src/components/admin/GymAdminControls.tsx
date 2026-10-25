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
  disabled: boolean;
  pending: "assign" | null;
  error: string;
  notice: string;
  onAssign: (userId: string) => Promise<boolean>;
  onRetryCandidates: () => void;
  onOpenDetails: (administrator: GymAdministrator) => void;
  onClearFeedback: () => void;
}

function displayName(admin: GymAdministrator) {
  return [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email;
}

/**
 * Assign control for a gym's Gym Administrators (US-006, FR-003). The Admin picks from the
 * accounts approved for this gym; the parent page saves each assignment and only shows what the
 * server confirmed.
 */
export default function GymAdminControls({
  administrators, candidates, candidatesError, disabled, pending, error, notice,
  onAssign, onRetryCandidates, onOpenDetails, onClearFeedback,
}: Props) {
  const [userId, setUserId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const select = useRef<HTMLSelectElement>(null);
  const wasAssigning = useRef(false);
  const noneWaiting = candidates !== null && candidates.length === 0;

  useEffect(() => {
    if (wasAssigning.current && pending !== "assign" && !disabled) select.current?.focus();
    wasAssigning.current = pending === "assign";
  }, [pending, disabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const message = !userId ? "Choose a Gym Administrator to assign."
      : administrators.some(admin => admin.userId === userId)
        ? "That administrator is already assigned to this gym." : "";
    setFieldError(message);
    if (message) { select.current?.focus(); return; }
    if (await onAssign(userId)) { setUserId(""); select.current?.focus(); }
  }

  return <GymAdminDisplay administrators={administrators} onOpen={onOpenDetails}>
    <form onSubmit={event => void submit(event)} noValidate aria-label="Assign Gym Administrator"
      aria-busy={pending === "assign"} className={styles.form}>
      <label htmlFor="gym-admin-candidate">Gym Administrator to assign</label>
      <p id="gym-admin-help" className={styles.help}>
        {candidates === null && !candidatesError ? "Loading the accounts approved for this gym…"
          : noneWaiting ? "No approved Gym Administrator accounts are waiting for this gym."
            : "Accounts approved for this gym that aren't assigned yet."}
      </p>
      <select id="gym-admin-candidate" ref={select} value={userId} required
        disabled={disabled}
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
      <button type="submit" className={pageStyles.primary} disabled={disabled}>
        {pending === "assign" ? "Assigning…" : "Assign administrator"}
      </button>
    </form>
    <div role="status" aria-live="polite">{notice && <p className={pageStyles.success}>{notice}</p>}</div>
    {error && <p role="alert" className={pageStyles.error}>{error}</p>}
  </GymAdminDisplay>;
}
