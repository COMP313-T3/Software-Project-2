import { useEffect, useRef, useState, type FormEvent } from "react";
import { DIVISION_NAME_MAX_LENGTH } from "../../constants/divisions.ts";
import { ApiError } from "../../lib/apiClient.ts";
import type { CompetitionDivision, ManagedClimberRegistration } from "../../lib/divisionsApi.ts";
import styles from "../../pages/CompetitionDivisionsPage.module.css";

function saveError(error: unknown, fallback: string) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
    ? error.message : fallback;
}

/** Name-only creation, matching the current division API. Input stays intact on failed saves. */
export function CreateDivisionForm({ busy, onCreate }: {
  busy: boolean;
  onCreate: (name: string) => Promise<CompetitionDivision | undefined>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const focusAfterCreate = useRef(false);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (!busy && (error || focusAfterCreate.current)) { input.current?.focus(); focusAfterCreate.current = false; }
  }, [error, busy, name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitting.current) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > DIVISION_NAME_MAX_LENGTH) {
      setError(trimmed ? "Use 50 characters or fewer." : "Enter the division name.");
      return;
    }
    submitting.current = true;
    setError("");
    try {
      const result = await onCreate(trimmed);
      if (result) { focusAfterCreate.current = true; setName(""); }
    } catch (problem) {
      setError(problem instanceof ApiError && problem.fields?.name
        ? problem.fields.name
        : saveError(problem, "Couldn't confirm the division save. Refresh the list before trying again."));
    } finally { submitting.current = false; }
  }

  return <form aria-label="Create division" onSubmit={event => void submit(event)} noValidate className={styles.createForm}>
    <label htmlFor="division-name">Division name</label>
    <div className={styles.createControls}>
      <input id="division-name" ref={input} value={name} required maxLength={DIVISION_NAME_MAX_LENGTH}
        autoComplete="off" placeholder="e.g. Beginner, Open, Youth" disabled={busy}
        aria-invalid={!!error} aria-describedby={error ? "division-name-help division-name-error" : "division-name-help"}
        onChange={event => { setName(event.target.value); setError(""); }} />
      <button type="submit" className={styles.primary} disabled={busy}>Create division</button>
    </div>
    <p id="division-name-help" className={styles.help}>Up to 50 characters. Each name must be unique within this competition.</p>
    {error && <p id="division-name-error" role="alert" className={styles.fieldError}>{error}</p>}
  </form>;
}

/** The options come only from this competition; the server verifies the assignment too. */
export function ClimberDivisionControl({ registration, divisions, busy, onAssign }: {
  registration: ManagedClimberRegistration;
  divisions: CompetitionDivision[];
  busy: boolean;
  onAssign: (climberId: string, divisionId: string) => Promise<ManagedClimberRegistration | undefined>;
}) {
  const currentId = divisions.some(division => division._id === registration.division?._id)
    ? registration.division!._id : "";
  const [selectedId, setSelectedId] = useState(currentId);
  const [error, setError] = useState("");
  const select = useRef<HTMLSelectElement>(null);
  const submitting = useRef(false);
  const id = "assign-" + registration.registrationId;
  const name = [registration.climber?.firstName, registration.climber?.lastName].filter(Boolean).join(" ") || "this climber";
  useEffect(() => { if (error && !busy) select.current?.focus(); }, [error, busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitting.current || !registration.climber || selectedId === currentId) return;
    if (!divisions.some(division => division._id === selectedId)) {
      setError("Choose a division from this competition.");
      return;
    }
    submitting.current = true;
    setError("");
    try {
      const result = await onAssign(registration.climber._id, selectedId);
      if (result) setSelectedId(result.division?._id ?? "");
    } catch (problem) {
      setError(problem instanceof ApiError && problem.fields?.divisionId
        ? problem.fields.divisionId
        : saveError(problem, "Couldn't confirm the assignment. Refresh the list before trying again."));
    } finally { submitting.current = false; }
  }

  if (!registration.climber) return <p className={styles.help}>Climber account unavailable.</p>;
  if (!divisions.length) return <p className={styles.help}>Create a division to assign this climber.</p>;
  return <form aria-label={"Assign division for " + name} onSubmit={event => void submit(event)} noValidate>
    <label htmlFor={id} className={styles.hidden}>Division for {name}</label>
    <div className={styles.assignControls}>
      <select id={id} ref={select} value={selectedId} disabled={busy}
        aria-invalid={!!error} aria-describedby={error ? id + "-error" : undefined}
        onChange={event => { setSelectedId(event.target.value); setError(""); }}>
        <option value="">Choose division</option>
        {divisions.map(division => <option key={division._id} value={division._id}>{division.name}</option>)}
      </select>
      <button type="submit" className={styles.secondary} disabled={busy || !selectedId || selectedId === currentId}>
        {currentId ? "Save division" : "Assign division"}
      </button>
    </div>
    {error && <p id={id + "-error"} role="alert" className={styles.fieldError}>{error}</p>}
  </form>;
}
