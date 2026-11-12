import { useEffect, useRef, useState, type FormEvent } from "react";
import { DIVISION_NAMES } from "../../constants/divisions.ts";
import { ApiError } from "../../lib/apiClient.ts";
import type { CompetitionDivision, ManagedClimberRegistration } from "../../lib/divisionsApi.ts";
import styles from "../../pages/CompetitionDivisionsPage.module.css";

function saveError(error: unknown, fallback: string) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
    ? error.message : fallback;
}

/**
 * Creating a division is choosing one of the four division names the competition doesn't have yet.
 * The choice stays as it was when a save fails.
 */
export function CreateDivisionForm({ busy, existing, onCreate }: {
  busy: boolean;
  existing: string[];
  onCreate: (name: string) => Promise<CompetitionDivision | undefined>;
}) {
  const taken = new Set(existing.map(name => name.trim().toLowerCase()));
  const available = DIVISION_NAMES.filter(name => !taken.has(name.toLowerCase()));
  const [choice, setChoice] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLSelectElement>(null);
  const complete = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  const focusAfterCreate = useRef(false);
  const name = available.find(option => option === choice) ?? "";
  const hasChoices = available.length > 0;
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (busy || !(error || focusAfterCreate.current)) return;
    (hasChoices ? input.current : complete.current)?.focus();
    focusAfterCreate.current = false;
  }, [error, busy, name, hasChoices]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitting.current) return;
    if (!name) {
      setError("Choose a division name.");
      return;
    }
    submitting.current = true;
    setError("");
    try {
      const result = await onCreate(name);
      if (result) { focusAfterCreate.current = true; setChoice(""); }
    } catch (problem) {
      setError(problem instanceof ApiError && problem.fields?.name
        ? problem.fields.name
        : saveError(problem, "Couldn't confirm the division save. Check the list before trying again."));
    } finally { submitting.current = false; }
  }

  if (!hasChoices) {
    return <p ref={complete} tabIndex={-1} className={styles.allDivisions}>This competition has all four divisions: {DIVISION_NAMES.join(", ")}.</p>;
  }
  return <form aria-label="Create division" onSubmit={event => void submit(event)} noValidate className={styles.createForm}>
    <label htmlFor="division-name">Division name</label>
    <div className={styles.createControls}>
      <select id="division-name" ref={input} value={name} required disabled={busy}
        aria-invalid={!!error} aria-describedby={error ? "division-name-help division-name-error" : "division-name-help"}
        onChange={event => { setChoice(event.target.value); setError(""); }}>
        <option value="">Choose a division</option>
        {available.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      <button type="submit" className={styles.primary} disabled={busy}>Create division</button>
    </div>
    <p id="division-name-help" className={styles.help}>A division is Open, Beginner, Youth, or Advanced. A competition can have each one once.</p>
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
  const [savedId, setSavedId] = useState(currentId);
  const [error, setError] = useState("");
  const select = useRef<HTMLSelectElement>(null);
  const submitting = useRef(false);
  const id = "assign-" + registration.registrationId;
  // The saved division changed, such as after a live update. The choice follows it, unless
  // another division was picked and not saved yet.
  if (currentId !== savedId) {
    setSavedId(currentId);
    if (selectedId === savedId) setSelectedId(currentId);
  }
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
        : saveError(problem, "Couldn't confirm the assignment. Check the climber's division before trying again."));
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
