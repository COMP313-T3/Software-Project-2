import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { resultClimberName, resultRouteName, validateResultInput, type ResultAction, type ResultFields } from "../../lib/resultEntry.ts";
import type { ResultEntry } from "../../lib/resultsApi.ts";
import workspace from "./GymAdminDashboard.module.css";
import styles from "../../pages/ResultEntryPage.module.css";

export function ResultInputControls({ entry, disabled, recordsFlash, errors, onChange, onEditing, onReview }: {
  entry: ResultEntry; disabled: boolean; recordsFlash: boolean; errors: ResultFields;
  onChange: () => void; onReview: (action: ResultAction) => void;
  /** Called with true while the totals differ from the saved result, so the page doesn't reload over them. */
  onEditing: (editing: boolean) => void;
}) {
  const [mode, setMode] = useState<"attempt" | "totals">("attempt");
  const [attempts, setAttempts] = useState(String(entry.result?.attempts ?? 0));
  const [sent, setSent] = useState(entry.result?.sent ?? false);
  const [local, setLocal] = useState<ResultFields>({});
  const [notice, setNotice] = useState("");
  const maximum = entry.scoring?.maxAttempts ?? 0;
  const attemptDisabled = disabled || entry.result?.sent === true || entry.attemptsLeft === 0;
  const fields = { ...errors, ...local };
  const editing = mode === "totals" && (attempts !== String(entry.result?.attempts ?? 0) || sent !== (entry.result?.sent ?? false));
  useEffect(() => { onEditing(editing); return () => onEditing(false); }, [editing, onEditing]);
  function review(event: FormEvent) {
    event.preventDefault(); if (disabled) return;
    const checked = validateResultInput(attempts, sent, maximum); setLocal(checked.fields); setNotice("");
    if (!checked.input) { document.getElementById("result-attempts")?.focus(); return; }
    if (entry.result && checked.input.attempts === entry.result.attempts && checked.input.sent === entry.result.sent) { setNotice("Change the attempts or send status before saving."); return; }
    onReview({ kind: "save", input: checked.input });
  }
  return <section className={workspace.panel} aria-labelledby="result-input-title">
    <h2 id="result-input-title">Record a result</h2>
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.hidden}>Result entry method</legend>
      <div className={styles.methods}>
        <label><input type="radio" name="result-method" checked={mode === "attempt"} onChange={() => { setMode("attempt"); onChange(); }} />Record next attempt</label>
        <label><input type="radio" name="result-method" checked={mode === "totals"} onChange={() => { setMode("totals"); onChange(); }} />Enter or correct totals</label>
      </div>
      {mode === "attempt" ? <div>
        <p className={styles.help}>Record one more attempt for the selected Climber and problem. Review the selection before confirming.</p>
        <div className={styles.actions}><button type="button" className={workspace.secondary} disabled={attemptDisabled} onClick={() => onReview({ kind: "attempt", sent: false })}>Record failed attempt</button>
          <button type="button" className={workspace.primary} disabled={attemptDisabled} onClick={() => onReview({ kind: "attempt", sent: true })}>Record send</button></div>
        {entry.result?.sent ? <p className={styles.help}>This problem is already sent. Choose Enter or correct totals to correct a saved result.</p>
          : entry.attemptsLeft === 0 && <p className={styles.help}>All allowed attempts have been used. Choose Enter or correct totals if the saved result needs correcting.</p>}
        {recordsFlash && <p className={styles.help}>A send on the first attempt is recorded as a flash automatically.</p>}
      </div> : <form onSubmit={review} noValidate aria-label="Enter result totals">
        <div className={styles.fields}><div><label htmlFor="result-attempts">Total attempts</label>
          <input id="result-attempts" type="number" inputMode="numeric" min="0" max={maximum} step="1" value={attempts} aria-invalid={Boolean(fields.attempts)} aria-describedby="result-attempts-help result-attempts-error"
            onChange={event => { setAttempts(event.target.value); setLocal({}); setNotice(""); onChange(); }} />
          <p id="result-attempts-help" className={styles.help}>Include the successful attempt. This competition allows up to {maximum} attempts per problem.</p>
          <p id="result-attempts-error" className={styles.errorText}>{fields.attempts ?? ""}</p></div>
          <div><label className={styles.check}><input type="checkbox" checked={sent} aria-invalid={Boolean(fields.sent)} aria-describedby="result-sent-error" onChange={event => { setSent(event.target.checked); setLocal({}); setNotice(""); onChange(); }} />The Climber sent this problem</label>
            <p id="result-sent-error" className={styles.errorText}>{fields.sent ?? ""}</p>
            {recordsFlash && <p className={styles.help}>{sent && Number(attempts) === 1 ? "This first-attempt send will be recorded as a flash." : "A flash is a successful send on the first attempt."}</p>}
          </div></div>
        <button type="submit" className={workspace.primary}>Review result</button>
        {entry.result && <p className={styles.help}>Saving totals replaces this Climber's saved result on this problem.</p>}
        {notice && <p className={styles.errorText} role="alert">{notice}</p>}
      </form>}
      {fields.flash && <p className={styles.errorText} role="alert">{fields.flash}</p>}
    </fieldset>
  </section>;
}

export function ConfirmResult({ entry, action, busy, onCancel, onConfirm }: {
  entry: ResultEntry; action: ResultAction; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const id = useId(), dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), closing = useRef(false);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closing.current = false; if (element && !element.open) element.showModal(); cancel.current?.focus();
    return () => { closing.current = true; if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} role="alertdialog" className={styles.dialog} aria-labelledby={id + "-title"} aria-describedby={id + "-summary"}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onClose={() => { if (closing.current || dialog.current?.open !== false) return; if (busy) dialog.current?.showModal(); else onCancel(); }}>
    <h2 id={id + "-title"}>{action.kind === "save" ? "Save official result?" : "Record this attempt?"}</h2>
    <p><strong>{resultClimberName(entry.climber)}</strong></p><p>{resultRouteName(entry.route)}</p>
    <p id={id + "-summary"}>{action.kind === "save" ? `${action.input.attempts} total attempts, ${action.input.sent ? "sent" : "not sent"}. ${entry.result ? "This replaces the existing result for this Climber and problem." : "This saves a new official result."}` : `Record one additional ${action.sent ? "successful send" : "failed attempt"} for this Climber on this problem.`}</p>
    <p className={styles.help}>TopSend calculates and saves the official score using this competition's scoring rules.</p>
    {busy && <p role="status">Saving official result…</p>}
    <div className={styles.actions}><button ref={cancel} className={workspace.secondary} disabled={busy} type="button" onClick={onCancel}>Cancel</button>
      <button className={workspace.primary} disabled={busy} type="button" onClick={onConfirm}>Confirm and save</button></div>
  </dialog>;
}
