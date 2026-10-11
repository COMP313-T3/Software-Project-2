import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/apiClient.ts";
import { updateManagedCompetition, type ManagedCompetitionDetails, type UpdateCompetitionInput } from "../../lib/gymAdminApi.ts";
import { COMPETITION_NAME_MAX_LENGTH, COMPETITION_LOCATION_MAX_LENGTH, COMPETITION_DESCRIPTION_MAX_LENGTH, COMPETITION_MAX_CAPACITY } from "../../constants/competitions.ts";
import styles from "../../pages/CreateCompetitionPage.module.css";
import workspace from "./GymAdminDashboard.module.css";

type Values = { name: string; date: string; location: string; description: string; capacity: string; registrationStatus: "OPEN" | "CLOSED" };
type Field = keyof Values;
const fields: Field[] = ["name", "date", "location", "description", "capacity", "registrationStatus"];
function valuesOf(c: ManagedCompetitionDetails): Values {
  return { name: c.name, date: c.date, location: c.location, description: c.description ?? "", capacity: String(c.capacity), registrationStatus: c.registrationStatus };
}
function validate(v: Values, count?: number): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const [field, max] of [["name", COMPETITION_NAME_MAX_LENGTH], ["location", COMPETITION_LOCATION_MAX_LENGTH]] as const) {
    if (!v[field].trim()) errors[field] = `Enter the competition ${field}.`;
    else if (v[field].trim().length > max) errors[field] = `Use ${max} characters or fewer.`;
  }
  const parsed = new Date(`${v.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v.date) errors.date = "Choose a valid event date.";
  if (v.description.trim().length > COMPETITION_DESCRIPTION_MAX_LENGTH) errors.description = `Use ${COMPETITION_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  const capacity = Number(v.capacity);
  if (!v.capacity.trim() || !Number.isInteger(capacity) || capacity < 1 || capacity > COMPETITION_MAX_CAPACITY) errors.capacity = `Enter a whole number from 1 to ${COMPETITION_MAX_CAPACITY}.`;
  else if (count !== undefined && capacity < count) errors.capacity = `Capacity cannot be less than the ${count} confirmed registrations.`;
  return errors;
}

/** US-013 #54/#55 → FR-004 / AC-008. Counts and saved values come from the protected API. */
export default function CompetitionDetailsForm({ competition, onSaved, onDenied, onBusy }: {
  competition: ManagedCompetitionDetails; onSaved: (c: ManagedCompetitionDetails) => void; onDenied: (error: unknown) => void; onBusy: (busy: boolean) => void;
}) {
  const [record, setRecord] = useState(competition);
  const [values, setValues] = useState(() => valuesOf(competition));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const live = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; request.current?.abort(); onBusy(false); }; }, [onBusy]);
  const baseline = valuesOf(record);
  const dirty = fields.some(field => values[field] !== baseline[field]);
  function change(field: Field, value: string) {
    setValues(v => ({ ...v, [field]: value })); setErrors(e => ({ ...e, [field]: undefined })); setMessage(""); setSuccess("");
  }
  function focusFirst(e: Partial<Record<Field, string>>) {
    const first = fields.find(field => e[field]);
    if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (request.current || !dirty) return;
    const validation = validate(values, record.registeredClimberCount);
    setErrors(validation); setSuccess(""); setMessage("");
    if (Object.keys(validation).length) { focusFirst(validation); return; }
    const payload: UpdateCompetitionInput = {};
    for (const field of fields) {
      if (values[field] === baseline[field]) continue;
      if (field === "capacity") payload.capacity = Number(values.capacity);
      else if (field === "registrationStatus") payload.registrationStatus = values.registrationStatus;
      else payload[field] = values[field].trim();
    }
    const controller = new AbortController(); request.current = controller; setPending(true); onBusy(true);
    try {
      const updated = await updateManagedCompetition(record._id, payload, controller.signal);
      if (!live.current) return;
      setRecord(updated); setValues(valuesOf(updated)); onSaved(updated); setSuccess("Competition details saved.");
    } catch (error) {
      if (!live.current) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onDenied(error); return; }
      const serverFields: Partial<Record<Field, string>> = {};
      if (error instanceof ApiError && error.fields) for (const field of fields) if (error.fields[field]) serverFields[field] = error.fields[field];
      setErrors(serverFields); focusFirst(serverFields);
      setMessage(error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message : "Couldn't confirm the save. Your input is preserved. Refresh details to check the saved values before trying again.");
    } finally {
      request.current = null; if (live.current) { setPending(false); onBusy(false); }
    }
  }
  function reset() { setValues(valuesOf(record)); setErrors({}); setMessage(""); setSuccess(""); }
  function props(field: Field) {
    return { id: `edit-${field}`, name: field, value: values[field], "aria-invalid": !!errors[field], "aria-describedby": errors[field] ? `edit-${field}-error` : undefined };
  }
  function error(field: Field) { return errors[field] ? <p id={`edit-${field}-error`} className={styles.fieldError}>{errors[field]}</p> : null; }
  return <>
    <dl className={workspace.details}><div><dt>Gym</dt><dd>{record.gym?.name ?? "Gym unavailable"}</dd></div><div><dt>Publication status</dt><dd>{record.status === "DRAFT" ? "Draft" : record.status === "PUBLISHED" ? "Published" : "Cancelled"}</dd></div><div><dt>Registered Climbers</dt><dd>{record.registeredClimberCount === undefined ? "—" : record.registeredClimberCount.toLocaleString("en-CA")}</dd><p className={styles.help}>Confirmed registrations for this competition.</p></div></dl>
    <form ref={form} className={`${styles.form} ${workspace.competitionForm}`} aria-label="Edit competition details" onSubmit={save} noValidate>
      <fieldset className={styles.fields} disabled={pending}>
        <div><label htmlFor="edit-name">Competition name</label><input {...props("name")} maxLength={COMPETITION_NAME_MAX_LENGTH} onChange={e => change("name", e.target.value)} />{error("name")}</div>
        <div className={styles.dateCapacity}><div><label htmlFor="edit-date">Date</label><input {...props("date")} type="date" onChange={e => change("date", e.target.value)} />{error("date")}</div><div><label htmlFor="edit-capacity">Maximum participants</label><input {...props("capacity")} type="number" min={Math.max(1, record.registeredClimberCount ?? 1)} max={COMPETITION_MAX_CAPACITY} step={1} onChange={e => change("capacity", e.target.value)} />{error("capacity")}<p className={styles.help}>1–1,000 participants; capacity must cover all confirmed registrations.</p></div></div>
        <div><label htmlFor="edit-location">Location</label><input {...props("location")} maxLength={COMPETITION_LOCATION_MAX_LENGTH} onChange={e => change("location", e.target.value)} />{error("location")}</div>
        <div><label htmlFor="edit-description">Description <span className={styles.optional}>(optional)</span></label><textarea {...props("description")} rows={4} maxLength={COMPETITION_DESCRIPTION_MAX_LENGTH} onChange={e => change("description", e.target.value)} />{error("description")}</div>
        <div><label htmlFor="edit-registrationStatus">Registration status</label><select {...props("registrationStatus")} onChange={e => change("registrationStatus", e.target.value)}><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select><p className={styles.help}>Opening or closing registration does not change publication status.</p></div>
      </fieldset>
      {message && <p role="alert" className={styles.error}>{message}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : "Save competition details"}</button><button type="button" disabled={pending || !dirty} onClick={reset}>Discard changes</button></div>
      {pending && <p role="status">Saving competition details…</p>}
    </form>
  </>;
}
