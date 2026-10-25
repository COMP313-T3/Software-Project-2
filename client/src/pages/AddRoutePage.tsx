import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import { ApiError } from "../lib/apiClient.ts";
import { INVALID_COMPETITION_LINK, isInvalidCompetitionLink } from "../lib/competitionLink.ts";
import { formatCalendarDate } from "../lib/dateFormat.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { createCompetitionRoute, type CreatedRoute, type CreateRouteInput } from "../lib/routesApi.ts";
import { ROUTE_MAX_POINTS, ROUTE_NAME_MAX_LENGTH, ROUTE_NOTES_MAX_LENGTH, ROUTE_NUMBER_MAX_LENGTH } from "../constants/routes.ts";
import {
  ROUTE_FIELD_ORDER, ROUTE_POINTS_MESSAGE, ROUTE_POINTS_RANGE, validateRouteForm,
  type RouteField, type RouteFieldErrors, type RouteFormValues,
} from "../lib/routeValidation.ts";
import formStyles from "./CreateCompetitionPage.module.css";
import styles from "./AddRoutePage.module.css";

const emptyValues = (): RouteFormValues => ({ routeNumber: "", name: "", grade: "", pointValue: "", notes: "" });
function loadMessage(error: unknown) {
  return error instanceof ApiError && error.status > 0 && error.status < 500
    ? error.message : "Couldn't load this competition. Please try again.";
}

/** US-016 (#71/#72), FR-006, AC-010: the setter's official grade is sent unchanged.
 * The API remains responsible for role, active gym assignment and event ownership. */
export default function AddRoutePage() {
  const { user } = useSession();
  const { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  return <RouteWorkspace key={user.userId + ":" + competitionId} competitionId={competitionId} />;
}

function RouteWorkspace({ competitionId }: { competitionId: string }) {
  const location = useLocation();
  const routesPath = `/gym-admin/competitions/${encodeURIComponent(competitionId)}/routes${location.search}`;
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; competition: ManagedCompetitionDetails | null; error: unknown }>({
    revision: -1, competition: null, error: null,
  });
  const loading = read.revision !== revision;
  useEffect(() => {
    const controller = new AbortController();
    getManagedCompetition(competitionId, controller.signal).then(competition => {
      if (!controller.signal.aborted) setRead({ revision, competition, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ revision, competition: null, error });
    });
    return () => controller.abort();
  }, [competitionId, revision]);
  useEffect(() => { document.getElementById("main-content")?.scrollIntoView?.({ block: "start" }); }, []);

  return <AppLayout title="Add route">
    <title>Add Route | TopSend</title>
    <div className={workspace.intro}><div className={workspace.introText}>
      <Link className={workspace.back} to={routesPath}>Back to boulder problems</Link>
      <p>Add a boulder problem to your competition.</p>
    </div></div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status" className={workspace.muted}>Loading selected competition…</p></section>
      : read.error ? <section className={workspace.panel} role="alert">
        <h2>Route form unavailable</h2><p>{isInvalidCompetitionLink(read.error) ? INVALID_COMPETITION_LINK : loadMessage(read.error)}</p>
        {!isInvalidCompetitionLink(read.error) && <button type="button" className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button>}
      </section>
      : read.competition && <RouteForm competition={read.competition} routesPath={routesPath}
        onDenied={error => setRead({ revision, competition: null, error })} />}
  </AppLayout>;
}

function RouteForm({ competition, routesPath, onDenied }: {
  competition: ManagedCompetitionDetails; routesPath: string; onDenied: (error: ApiError) => void;
}) {
  const location = useLocation();
  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState<RouteFieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<{ route: CreatedRoute; submitted: CreateRouteInput } | null>(null);
  const fields = useRef<Partial<Record<RouteField, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const write = useRef<AbortController | null>(null);
  const focusRequest = useRef<RouteFieldErrors | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => {
    if (saved) successHeading.current?.focus();
    else fields.current.routeNumber?.focus();
  }, [saved]);
  useEffect(() => {
    if (pending || !focusRequest.current) return;
    const field = ROUTE_FIELD_ORDER.find(key => focusRequest.current?.[key]);
    focusRequest.current = null;
    if (field) fields.current[field]?.focus();
    else messageRef.current?.focus();
  }, [errors, pending]);

  function change(field: RouteField, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setMessage("");
  }
  function fieldProps(field: RouteField, help?: string) {
    return {
      id: `route-${field}`, name: field, value: values[field],
      ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => { fields.current[field] = element; },
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": [help, errors[field] ? `route-${field}-error` : ""].filter(Boolean).join(" ") || undefined,
    };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (write.current || saved) return;
    const next = validateRouteForm(values);
    if (fields.current.pointValue instanceof HTMLInputElement && fields.current.pointValue.validity.badInput) {
      next.pointValue = ROUTE_POINTS_MESSAGE;
    }
    setErrors(next); setMessage("");
    if (Object.keys(next).length) {
      setMessage("Check the highlighted fields and try again."); focusRequest.current = next;
      return;
    }
    const submitted: CreateRouteInput = {
      routeNumber: values.routeNumber.trim(),
      ...(values.name.trim() ? { name: values.name.trim() } : {}),
      grade: values.grade.trim(),
      pointValue: Number(values.pointValue),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };
    const controller = new AbortController(); write.current = controller; setPending(true);
    try {
      const route = await createCompetitionRoute(competition._id, submitted, controller.signal);
      if (!controller.signal.aborted) setSaved({ route, submitted });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.code === "COMPETITION_NOT_FOUND")) {
        onDenied(error); return;
      }
      const nextErrors: RouteFieldErrors = {};
      if (error instanceof ApiError && (error.code === "VALIDATION_ERROR" || error.code === "ROUTE_EXISTS")) {
        for (const field of ROUTE_FIELD_ORDER) {
          if (typeof error.fields?.[field] === "string") nextErrors[field] = error.fields[field];
        }
      }
      setErrors(nextErrors); focusRequest.current = nextErrors;
      setMessage(error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message
        : "Couldn't confirm the save. Try again with the same route number; existing routes won't be duplicated.");
    } finally {
      if (!controller.signal.aborted) { write.current = null; setPending(false); }
    }
  }

  const context = <div className={styles.context} aria-label="Selected competition">
    <span className={formStyles.help}>Selected competition</span><strong>{competition.name}</strong>
    <span><time dateTime={competition.date}>{formatCalendarDate(competition.date)}</time>{competition.gym?.name ? ` at ${competition.gym.name}` : ""}</span>
  </div>;

  if (saved) return <section className={workspace.panel} aria-label="Created route">
    {context}
    <div className={formStyles.success} role="status"><h2 ref={successHeading} tabIndex={-1}>Route created</h2>
      <p>{saved.submitted.name ?? `Route ${saved.submitted.routeNumber}`} was saved for {competition.name}.</p></div>
    <dl className={workspace.details}>
      <div><dt>Route number</dt><dd>{saved.submitted.routeNumber}</dd></div>
      {saved.submitted.name && <div><dt>Route name</dt><dd>{saved.submitted.name}</dd></div>}
      <div><dt>Official V-grade</dt><dd>{saved.route.grade}</dd></div>
      <div><dt>Point value</dt><dd>{saved.submitted.pointValue}</dd></div>
    </dl>
    {saved.submitted.notes && <p className={styles.notes}>{saved.submitted.notes}</p>}
    <div className={formStyles.actions}>
      <Link className={formStyles.primary} to={`/gym-admin/competitions/${encodeURIComponent(competition._id)}/routes/${encodeURIComponent(saved.route.routeId)}${location.search}`}>View route details</Link>
      <button type="button" onClick={() => { setValues(emptyValues()); setErrors({}); setMessage(""); setSaved(null); }}>Add another route</button>
      <Link to={routesPath}>Back to boulder problems</Link>
    </div>
  </section>;

  return <div className={formStyles.grid}>
    <form className={workspace.panel + " " + formStyles.form} aria-label="Add boulder problem" aria-busy={pending} noValidate onSubmit={event => void submit(event)}>
      <h2>Boulder problem details</h2><p className={formStyles.help}>Route number, official V-grade, and point value are required.</p>
      {context}
      <fieldset className={formStyles.fields} disabled={pending}>
        <legend className={formStyles.hidden}>Route information</legend>
        <div className={formStyles.dateCapacity}>
          <div><label htmlFor="route-routeNumber">Route number</label>
            <input {...fieldProps("routeNumber", "route-number-help")} required maxLength={ROUTE_NUMBER_MAX_LENGTH} autoComplete="off" placeholder="e.g. A1" onChange={event => change("routeNumber", event.target.value)} />
            <p id="route-number-help" className={formStyles.help}>Use a unique number or label within this competition, up to {ROUTE_NUMBER_MAX_LENGTH} characters.</p><FieldError field="routeNumber" errors={errors} /></div>
          <div><label htmlFor="route-grade">Official V-grade</label>
            <input {...fieldProps("grade", "route-grade-help")} required autoComplete="off" placeholder="e.g. V4" onChange={event => change("grade", event.target.value)} />
            <p id="route-grade-help" className={formStyles.help}>From V0 to V17, such as V4.</p><FieldError field="grade" errors={errors} /></div>
        </div>
        <div><label htmlFor="route-name">Route name <span className={formStyles.optional}>(optional)</span></label>
          <input {...fieldProps("name", "route-name-help")} maxLength={ROUTE_NAME_MAX_LENGTH} autoComplete="off" placeholder="e.g. Summit Traverse" onChange={event => change("name", event.target.value)} />
          <p id="route-name-help" className={formStyles.help}>Up to {ROUTE_NAME_MAX_LENGTH} characters. Leave it blank if the route goes by its number.</p><FieldError field="name" errors={errors} /></div>
        <div><label htmlFor="route-pointValue">Point value</label>
          <input {...fieldProps("pointValue", "route-points-help")} type="number" inputMode="numeric" required min={0} max={ROUTE_MAX_POINTS} step={1} placeholder="e.g. 25" onChange={event => change("pointValue", event.target.value)} />
          <p id="route-points-help" className={formStyles.help}>A whole number from {ROUTE_POINTS_RANGE}. It's what a top on the first attempt scores.</p><FieldError field="pointValue" errors={errors} /></div>
        <div><label htmlFor="route-notes">Notes <span className={formStyles.optional}>(optional)</span></label>
          <textarea {...fieldProps("notes", "route-notes-help")} rows={4} maxLength={ROUTE_NOTES_MAX_LENGTH} placeholder="Route setting or competition notes" onChange={event => change("notes", event.target.value)} />
          <p id="route-notes-help" className={formStyles.help}>Up to {ROUTE_NOTES_MAX_LENGTH} characters.</p><FieldError field="notes" errors={errors} /></div>
      </fieldset>
      {message && <div ref={messageRef} tabIndex={-1} role="alert" className={formStyles.error}><p>{message}</p></div>}
      <div className={formStyles.actions}>
        <button type="submit" className={formStyles.primary} disabled={pending}>{pending ? "Saving route…" : "Add route"}</button>
        <Link to={routesPath} aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }}>Cancel</Link>
      </div>
      {pending && <p role="status" className={formStyles.help}>Saving your boulder problem…</p>}
    </form>
    <aside className={workspace.panel + " " + formStyles.guide} aria-label="Route guidance">
      <h2>Set the official grade</h2>
      <p>The V-grade you enter is the route's official grade. TopSend keeps that grade as assigned by your gym.</p>
      <div className={formStyles.tip}><strong>One competition at a time</strong><p>This route will belong to {competition.name}. Route numbers must be unique within this event.</p></div>
    </aside>
  </div>;
}

function FieldError({ field, errors }: { field: RouteField; errors: RouteFieldErrors }) {
  return errors[field] ? <p id={`route-${field}-error`} className={formStyles.fieldError}>{errors[field]}</p> : null;
}
