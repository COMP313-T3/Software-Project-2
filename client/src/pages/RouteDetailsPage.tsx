import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate } from "../lib/dateFormat.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { getCompetitionRoute, updateCompetitionRoute, type ManagedRoute, type UpdateRouteInput } from "../lib/routesApi.ts";
import { ROUTE_MAX_POINTS, ROUTE_NAME_MAX_LENGTH, ROUTE_NOTES_MAX_LENGTH, ROUTE_NUMBER_MAX_LENGTH } from "../constants/routes.ts";
import {
  ROUTE_EDIT_FIELDS, ROUTE_POINTS_MESSAGE, ROUTE_POINTS_RANGE, validateRouteEdit,
  type RouteEditErrors, type RouteEditField, type RouteEditValues,
} from "../lib/routeValidation.ts";
import formStyles from "./CreateCompetitionPage.module.css";
import styles from "./RouteDetailsPage.module.css";

function readMessage(error: unknown) {
  return error instanceof ApiError && error.status > 0 && error.status < 500
    ? error.message : "Couldn't load route details. Please try again.";
}
function valuesOf(route: ManagedRoute): RouteEditValues {
  return {
    routeNumber: route.routeNumber, name: route.name ?? "", grade: route.grade,
    pointValue: route.pointValue === undefined ? "" : String(route.pointValue), notes: route.notes ?? "",
  };
}

/** US-017 (#79/#80) -> FR-006 -> AC-010. The API owns authorization and saved data;
 * this page never calculates or automatically changes the setter's official grade. */
export default function RouteDetailsPage() {
  const { user } = useSession();
  const { competitionId = "", routeId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  return <RouteWorkspace key={user.userId + ":" + competitionId + ":" + routeId} competitionId={competitionId} routeId={routeId} />;
}

function RouteWorkspace({ competitionId, routeId }: { competitionId: string; routeId: string }) {
  const location = useLocation();
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [read, setRead] = useState<{ revision: number; competition: ManagedCompetitionDetails | null; route: ManagedRoute | null; error: unknown }>({
    revision: -1, competition: null, route: null, error: null,
  });
  const loading = read.revision !== revision;
  const competitionPath = `/gym-admin/competitions/${encodeURIComponent(competitionId)}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const competition = await getManagedCompetition(competitionId, controller.signal);
        if (controller.signal.aborted) return;
        const route = await getCompetitionRoute(competitionId, routeId, controller.signal);
        if (!controller.signal.aborted) setRead({ revision, competition, route, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setRead({ revision, competition: null, route: null, error });
      }
    }
    void load(); return () => controller.abort();
  }, [competitionId, routeId, revision]);
  useEffect(() => { document.getElementById("main-content")?.scrollIntoView?.({ block: "start" }); }, []);

  return <AppLayout title="Route details">
    <title>Route Details | TopSend</title>
    <div className={workspace.intro}>
      <div className={workspace.introText}>
        <Link className={workspace.back} to={competitionPath + "/routes" + location.search}>Back to boulder problems</Link>
        <p>Review the saved route and update its competition information.</p>
      </div>
      <div className={workspace.actions}>
        <button type="button" className={workspace.secondary} disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Refresh route details</button>
        <Link className={workspace.secondary} to={competitionPath + location.search}>Back to competition</Link>
      </div>
    </div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status">Loading route details…</p></section>
      : read.error ? <section className={workspace.panel} role="alert"><h2>Route unavailable</h2><p>{readMessage(read.error)}</p>
        <button type="button" className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></section>
      : read.route && read.competition && <RouteEditor route={read.route} competition={read.competition} onBusy={setSaving}
        onDenied={error => setRead({ revision, competition: null, route: null, error })} />}
  </AppLayout>;
}

function RouteEditor({ route, competition, onBusy, onDenied }: {
  route: ManagedRoute; competition: ManagedCompetitionDetails; onBusy: (busy: boolean) => void; onDenied: (error: ApiError) => void;
}) {
  const [record, setRecord] = useState(route);
  const [values, setValues] = useState(() => valuesOf(route));
  const [errors, setErrors] = useState<RouteEditErrors>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const fields = useRef<Partial<Record<RouteEditField, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const request = useRef<AbortController | null>(null);
  const focusRequest = useRef<RouteEditErrors | null>(null);
  const alert = useRef<HTMLDivElement>(null);
  const savedStatus = useRef<HTMLParagraphElement>(null);
  const baseline = valuesOf(record);
  const dirty = ROUTE_EDIT_FIELDS.some(field => values[field] !== baseline[field]);
  useEffect(() => () => { request.current?.abort(); onBusy(false); }, [onBusy]);
  useEffect(() => {
    if (pending || !focusRequest.current) return;
    const field = ROUTE_EDIT_FIELDS.find(key => focusRequest.current?.[key]); focusRequest.current = null;
    if (field) fields.current[field]?.focus(); else alert.current?.focus();
  }, [errors, pending]);
  useEffect(() => { if (success) savedStatus.current?.focus(); }, [success]);

  function change(field: RouteEditField, value: string) {
    setValues(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined }));
    setMessage(""); setSuccess("");
  }
  function props(field: RouteEditField, help?: string) {
    return {
      id: `edit-route-${field}`, name: field, value: values[field],
      ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => { fields.current[field] = element; },
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": [help, errors[field] ? `edit-route-${field}-error` : ""].filter(Boolean).join(" ") || undefined,
    };
  }
  function fieldError(field: RouteEditField) {
    return errors[field] ? <p id={`edit-route-${field}-error`} className={formStyles.fieldError}>{errors[field]}</p> : null;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (request.current) return;
    const next = validateRouteEdit(values, baseline);
    if (fields.current.pointValue instanceof HTMLInputElement && fields.current.pointValue.validity.badInput) {
      next.pointValue = ROUTE_POINTS_MESSAGE;
    }
    setErrors(next); setMessage(""); setSuccess("");
    if (Object.keys(next).length) { setMessage("Check the highlighted fields and try again."); focusRequest.current = next; return; }
    const changes: UpdateRouteInput = {};
    if (values.routeNumber.trim() !== record.routeNumber) changes.routeNumber = values.routeNumber.trim();
    if (values.name.trim() !== (record.name ?? "")) changes.name = values.name.trim();
    if (values.grade.trim() !== record.grade) changes.grade = values.grade.trim();
    if (values.pointValue.trim() && Number(values.pointValue) !== record.pointValue) changes.pointValue = Number(values.pointValue);
    if (values.notes.trim() !== (record.notes ?? "")) changes.notes = values.notes.trim();
    if (!Object.keys(changes).length) { setMessage("Change at least one route detail."); focusRequest.current = {}; return; }
    const controller = new AbortController(); request.current = controller; setPending(true); onBusy(true);
    try {
      const updated = await updateCompetitionRoute(competition._id, record.routeId, changes, controller.signal);
      if (!controller.signal.aborted) { setRecord(updated); setValues(valuesOf(updated)); setSuccess("Route details saved."); }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onDenied(error); return; }
      const nextErrors: RouteEditErrors = {};
      if (error instanceof ApiError) for (const field of ROUTE_EDIT_FIELDS) {
        if (typeof error.fields?.[field] === "string") nextErrors[field] = error.fields[field];
      }
      setErrors(nextErrors); focusRequest.current = nextErrors;
      setMessage(error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message
        : "Couldn't confirm the save. Your input is preserved. Refresh route details to check saved values before trying again.");
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); onBusy(false); }
    }
  }
  function discard() { setValues(valuesOf(record)); setErrors({}); setMessage(""); setSuccess(""); }

  return <>
    <section className={workspace.panel + " " + styles.context} aria-label="Selected competition">
      <span>Selected competition</span><strong>{competition.name}</strong>
      <p><time dateTime={competition.date}>{formatCalendarDate(competition.date)}</time>{competition.gym?.name ? ` at ${competition.gym.name}` : ""}</p>
    </section>
    <div className={styles.grid}>
      <section className={workspace.panel} aria-label="Saved route information">
        {record.name && <p className={styles.number}>Route {record.routeNumber}</p>}<h2>{record.name || `Route ${record.routeNumber}`}</h2>
        <dl className={workspace.details}>
          <div><dt>Official V-grade</dt><dd>{record.grade}</dd></div>
          <div><dt>Point value</dt><dd>{record.pointValue === undefined ? "Not set" : record.pointValue}</dd></div>
          <div><dt>Grade status</dt><dd>{record.official ? "Official" : "Not official"}</dd></div>
          <div className={styles.noteRow}><dt>Notes</dt><dd className={styles.notes}>{record.notes || "No notes added."}</dd></div>
        </dl>
        <p className={formStyles.help}>These are the latest confirmed saved values.</p>
      </section>
      <form className={workspace.panel + " " + styles.editor} aria-label="Edit route details" aria-busy={pending} noValidate onSubmit={event => void save(event)}>
        <h2>Edit route</h2><p className={styles.help}>Your gym controls this route's official grade.</p>
        <fieldset className={formStyles.fields} disabled={pending}><legend className={formStyles.hidden}>Editable route information</legend>
          <div><label htmlFor="edit-route-routeNumber">Route number</label>
            <input {...props("routeNumber", "edit-number-help")} required maxLength={ROUTE_NUMBER_MAX_LENGTH} autoComplete="off" onChange={event => change("routeNumber", event.target.value)} />
            <p id="edit-number-help" className={formStyles.help}>Use a unique number or label within this competition, up to {ROUTE_NUMBER_MAX_LENGTH} characters.</p>{fieldError("routeNumber")}</div>
          <div><label htmlFor="edit-route-name">Route name <span className={formStyles.optional}>(optional)</span></label>
            <input {...props("name", "edit-name-help")} maxLength={ROUTE_NAME_MAX_LENGTH} autoComplete="off" onChange={event => change("name", event.target.value)} />
            <p id="edit-name-help" className={formStyles.help}>Up to {ROUTE_NAME_MAX_LENGTH} characters. Clear this field and save to call the route by its number.</p>{fieldError("name")}</div>
          <div><label htmlFor="edit-route-grade">Official V-grade</label>
            <input {...props("grade", "edit-grade-help")} required autoComplete="off" onChange={event => change("grade", event.target.value)} />
            <p id="edit-grade-help" className={formStyles.help}>From V0 to V17, such as V4.</p>{fieldError("grade")}</div>
          <div><label htmlFor="edit-route-pointValue">Point value</label>
            <input {...props("pointValue", "edit-points-help")} type="number" inputMode="numeric" min={0} max={ROUTE_MAX_POINTS} step={1} onChange={event => change("pointValue", event.target.value)} />
            <p id="edit-points-help" className={formStyles.help}>A whole number from {ROUTE_POINTS_RANGE}. It's what a top on the first attempt scores. Leaving this blank keeps the saved point value.</p>{fieldError("pointValue")}</div>
          <div><label htmlFor="edit-route-notes">Notes <span className={formStyles.optional}>(optional)</span></label>
            <textarea {...props("notes", "edit-notes-help")} rows={5} maxLength={ROUTE_NOTES_MAX_LENGTH} onChange={event => change("notes", event.target.value)} />
            <p id="edit-notes-help" className={formStyles.help}>Up to {ROUTE_NOTES_MAX_LENGTH} characters. Clear this field and save to remove the current notes.</p>{fieldError("notes")}</div>
        </fieldset>
        {message && <div ref={alert} tabIndex={-1} role="alert" className={formStyles.error}><p>{message}</p></div>}
        {success && <p ref={savedStatus} tabIndex={-1} role="status" className={formStyles.success}>{success}</p>}
        <div className={formStyles.actions}>
          <button type="submit" className={formStyles.primary} disabled={pending || !dirty}>{pending ? "Saving route…" : "Save route details"}</button>
          <button type="button" disabled={pending || !dirty} onClick={discard}>Discard changes</button>
        </div>
        {pending && <p role="status" className={formStyles.help}>Saving route details…</p>}
      </form>
    </div>
  </>;
}
