import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GymAdministrator } from "../../lib/gymsApi.ts";
import GymAdminDisplay from "./GymAdminDisplay.tsx";
import styles from "./GymAdminControls.module.css";
import pageStyles from "../../pages/GymsPage.module.css";

interface Props {
  administrators: GymAdministrator[];
  gymName: string;
  disabled: boolean;
  pending: "assign" | "remove" | null;
  error: string;
  notice: string;
  onAssign: (userId: string) => Promise<boolean>;
  onRemove: (userId: string) => Promise<boolean>;
  onClearFeedback: () => void;
}

function displayName(admin: GymAdministrator) {
  return [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email;
}

/** US-006 #36/#37, FR-003: the ADMIN-gated parent owns persistence and its
 * shared write lock. Never infer authorization from an ID or change an account's
 * role. Until a candidate lookup API exists, use the approved account's user ID. */
export default function GymAdminControls({ administrators, gymName, disabled, pending, error, notice, onAssign, onRemove, onClearFeedback }: Props) {
  const [userId, setUserId] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [target, setTarget] = useState<GymAdministrator | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const wasConfirming = useRef(false);
  const wasAssigning = useRef(false);

  useEffect(() => {
    if (target) confirmButton.current?.focus();
    else if (wasConfirming.current) {
      (removeTrigger.current?.isConnected ? removeTrigger.current : input.current)?.focus();
    }
    wasConfirming.current = Boolean(target);
  }, [target]);

  useEffect(() => {
    if (wasAssigning.current && pending !== "assign" && !disabled) input.current?.focus();
    wasAssigning.current = pending === "assign";
  }, [pending, disabled]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || target) return;
    const id = userId.trim().toLowerCase();
    const message = !id ? "Enter a Gym Administrator user ID."
      : !/^[a-f\d]{24}$/.test(id) ? "Enter a valid 24-character user ID."
      : administrators.some(admin => admin.userId.toLowerCase() === id)
        ? "That administrator is already assigned to this gym." : "";
    setFieldError(message);
    if (message) { input.current?.focus(); return; }
    if (await onAssign(id)) { setUserId(""); input.current?.focus(); }
  }

  async function confirmRemoval() {
    if (disabled || !target) return;
    if (await onRemove(target.userId)) setTarget(null);
  }

  return <GymAdminDisplay administrators={administrators} renderAction={admin => (
    <button type="button" className={styles.remove} disabled={disabled || Boolean(target)}
      aria-label={`Remove ${displayName(admin)} from this gym`}
      onClick={event => { removeTrigger.current = event.currentTarget; setTarget(admin); setFieldError(""); onClearFeedback(); }}>
      Remove
    </button>
  )}>
    <form onSubmit={event => void submit(event)} noValidate aria-label="Assign Gym Administrator"
      aria-busy={pending === "assign"} className={styles.form}>
      <label htmlFor="gym-admin-user-id">Gym Administrator user ID</label>
      <p id="gym-admin-help" className={styles.help}>Use an active account approved for this gym.</p>
      <input id="gym-admin-user-id" ref={input} value={userId} required maxLength={64}
        autoComplete="off" spellCheck={false} disabled={disabled || Boolean(target)}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={`gym-admin-help${fieldError ? " gym-admin-id-error" : ""}`}
        onChange={event => { setUserId(event.target.value); setFieldError(""); onClearFeedback(); }} />
      {fieldError && <p id="gym-admin-id-error" role="alert" className={pageStyles.fieldError}>{fieldError}</p>}
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
