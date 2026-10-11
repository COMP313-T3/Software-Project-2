import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import logoUrl from "../assets/brand/topsend-logo.png";
import { useSession } from "../components/session/sessionContext.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import {
  COMPETITION_DESCRIPTION_MAX_LENGTH, COMPETITION_LOCATION_MAX_LENGTH,
  COMPETITION_MAX_CAPACITY, COMPETITION_NAME_MAX_LENGTH,
} from "../constants/competitions.ts";
import { ApiError } from "../lib/apiClient.ts";
import {
  COMPETITION_FIELD_ORDER, competitionDateBounds, validateCompetitionForm,
  type CompetitionField, type CompetitionFieldErrors, type CompetitionFormValues,
} from "../lib/competitionValidation.ts";
import {
  createManagedCompetition, fetchGymAdminDashboard,
  type ManagedCompetitionDetails, type ManagedGym,
} from "../lib/gymAdminApi.ts";
import styles from "./CreateCompetitionPage.module.css";

function readError(error: unknown) {
  return error instanceof ApiError && error.status > 0 && error.status < 500
    ? error.message : "Couldn't load your assigned gyms. Please try again.";
}

/** US-012 #48/#49 → FR-004 → AC-007/AC-008. API authorization remains authoritative. */
export default function CreateCompetitionPage() {
  const { user } = useSession();
  const location = useLocation();
  if (user?.role !== "GYM_ADMIN") return <main className={workspace.denied}>
    <h1>Gym administrator access required</h1><Link to="/dashboard">Back to dashboard</Link>
  </main>;
  return <CreateWorkspace key={user.userId + location.search} />;
}

function CreateWorkspace() {
  const { user, logOut } = useSession();
  const location = useLocation();
  const [search] = useSearchParams();
  const dashboardPath = "/dashboard" + location.search;
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; gyms: ManagedGym[] | null; error: unknown }>({
    revision: -1, gyms: null, error: null,
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const loading = read.revision !== revision;

  useEffect(() => {
    const controller = new AbortController();
    fetchGymAdminDashboard(controller.signal).then(summary => {
      if (!controller.signal.aborted) setRead({ revision, gyms: summary.gyms, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ revision, gyms: null, error });
    });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => { document.getElementById("create-competition-main")?.scrollIntoView?.({ block: "start" }); }, []);

  async function onLogOut() {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError("");
    try { await logOut(); }
    catch {
      setLogoutError("Couldn't log out. Please try again.");
      setLoggingOut(false);
    }
  }

  return <div className={workspace.workspace}>
    <title>Create Competition | TopSend</title>
    <a className={workspace.skip} href="#create-competition-main">Skip to competition form</a>
    <aside className={workspace.sidebar}>
      <Link to={dashboardPath} aria-label="TopSend dashboard"><img src={logoUrl} alt="TopSend" width="159" height="52" /></Link>
      <p className={workspace.eyebrow}>Gym administration</p>
      <nav aria-label="Gym dashboard">
        <Link to={dashboardPath}>Overview</Link>
        <Link to={dashboardPath + "#competitions"}>Competitions</Link>
        <Link to={location.pathname + location.search} aria-current="page">Create competition</Link>
      </nav>
      <div className={workspace.account}>
        <p>{user?.email}</p>
        <button onClick={onLogOut} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</button>
        {logoutError && <p role="alert">{logoutError}</p>}
      </div>
    </aside>
    <main id="create-competition-main" className={workspace.main}>
      <Link to={dashboardPath}>← Back to dashboard</Link>
      <header className={workspace.heading}>
        <div><p className={workspace.eyebrow}>Plan your next event</p><h1>Create competition</h1>
          <p>Start with the event details. Your gym is connected when you save.</p></div>
      </header>
      {loading ? <section className={workspace.panel} aria-busy="true"><p role="status">Loading your assigned gyms…</p></section>
        : read.error ? <section className={workspace.panel} role="alert">
          <h2>Competition form unavailable</h2><p>{readError(read.error)}</p>
          <button onClick={() => setRevision(value => value + 1)}>Try again</button>
        </section>
        : !read.gyms?.length ? <section className={workspace.panel} role="alert">
          <h2>No active gym assigned</h2><p>Your account needs an active gym assignment before you can create a competition. Contact a System Administrator.</p>
        </section>
        : <CompetitionForm gyms={read.gyms} suggestedGymId={search.get("gymId") ?? ""} dashboardPath={dashboardPath} />}
    </main>
  </div>;
}

function CompetitionForm({ gyms, suggestedGymId, dashboardPath }: {
  gyms: ManagedGym[]; suggestedGymId: string; dashboardPath: string;
}) {
  function initialValues(): CompetitionFormValues {
    return {
      gymId: gyms.length === 1 ? gyms[0]._id : gyms.find(gym => gym._id === suggestedGymId)?._id ?? "",
      name: "", date: "", location: "", description: "", capacity: "",
    };
  }
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<CompetitionFieldErrors>({});
  const [message, setMessage] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<ManagedCompetitionDetails | null>(null);
  const fields = useRef<Partial<Record<CompetitionField, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>>({});
  const write = useRef<AbortController | null>(null);
  const focusRequest = useRef<CompetitionFieldErrors | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const bounds = competitionDateBounds();
  const gym = gyms.find(candidate => candidate._id === values.gymId);

  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => {
    if (created) successHeading.current?.focus();
    else fields.current.name?.focus();
  }, [created]);
  useEffect(() => {
    if (pending || !focusRequest.current) return;
    const field = COMPETITION_FIELD_ORDER.find(key => focusRequest.current?.[key] && fields.current[key]);
    focusRequest.current = null;
    if (field) fields.current[field]?.focus();
  }, [errors, pending]);

  function change(field: CompetitionField, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setMessage(""); setUnconfirmed(false);
  }
  function focusError(next: CompetitionFieldErrors) {
    // Wait for the disabled fieldset to be enabled and the error text to render.
    focusRequest.current = next;
  }
  function fieldProps(field: CompetitionField, help?: string) {
    return {
      id: "competition-" + field,
      name: field,
      value: values[field],
      ref: (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => { fields.current[field] = element; },
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": [help, errors[field] ? "competition-" + field + "-error" : ""].filter(Boolean).join(" ") || undefined,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (write.current || created || accessError) return;
    const nextErrors = validateCompetitionForm(values, gyms);
    setErrors(nextErrors); setMessage(""); setUnconfirmed(false);
    if (Object.keys(nextErrors).length) {
      setMessage("Check the highlighted fields and try again.");
      focusError(nextErrors);
      return;
    }
    const controller = new AbortController();
    write.current = controller; setPending(true);
    try {
      const result = await createManagedCompetition({
        name: values.name.trim(), date: values.date.trim(), capacity: Number(values.capacity),
        ...(values.location.trim() ? { location: values.location.trim() } : {}),
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        ...(gyms.length > 1 ? { gymId: values.gymId } : {}),
      }, controller.signal);
      if (!controller.signal.aborted) setCreated(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAccessError(error.message);
        return;
      }
      const fieldErrors: CompetitionFieldErrors = {};
      if (error instanceof ApiError && (error.code === "VALIDATION_ERROR" || error.code === "COMPETITION_EXISTS")) {
        for (const field of COMPETITION_FIELD_ORDER) {
          if (typeof error.fields?.[field] === "string") fieldErrors[field] = error.fields[field];
        }
      }
      setErrors(fieldErrors); focusError(fieldErrors);
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      setUnconfirmed(uncertain);
      setMessage(uncertain ? "Couldn't confirm the save. Check your competition list before trying again."
        : error instanceof ApiError ? error.message : "Couldn't save the competition.");
    } finally {
      if (!controller.signal.aborted) { write.current = null; setPending(false); }
    }
  }

  if (accessError) return <section className={workspace.panel} role="alert">
    <h2>Gym access unavailable</h2><p>{accessError}</p><Link to={dashboardPath}>Back to dashboard</Link>
  </section>;

  if (created) {
    const listPath = "/dashboard?gymId=" + encodeURIComponent(created.gymId) + "#competitions";
    const detailsPath = "/gym-admin/competitions/" + encodeURIComponent(created._id) + "?gymId=" + encodeURIComponent(created.gymId);
    return <section className={workspace.panel} aria-label="Created competition">
      <div className={styles.success} role="status"><h2 ref={successHeading} tabIndex={-1}>Competition created</h2>
        <p>{created.name} was saved for {created.gym?.name ?? "your gym"}.</p></div>
      <dl className={workspace.details}>
        <div><dt>Gym</dt><dd>{created.gym?.name ?? "Your gym"}</dd></div>
        <div><dt>Date</dt><dd><time dateTime={created.date}>{created.date}</time></dd></div>
        <div><dt>Location</dt><dd>{created.location}</dd></div>
        <div><dt>Participant capacity</dt><dd>{created.capacity}</dd></div>
        <div><dt>Status</dt><dd>{created.status === "DRAFT" ? "Draft" : created.status === "PUBLISHED" ? "Published" : "Cancelled"}</dd></div>
        <div><dt>Registration</dt><dd>{created.registrationStatus === "OPEN" ? "Open" : "Closed"}</dd></div>
      </dl>
      {created.description && <p className={workspace.description}>{created.description}</p>}
      <div className={styles.actions}><Link className={styles.primary} to={detailsPath}>View competition</Link><Link to={listPath}>Back to competitions</Link>
        <button onClick={() => { setValues(initialValues()); setErrors({}); setCreated(null); }}>Create another competition</button></div>
    </section>;
  }

  return <div className={styles.grid}>
    <form className={workspace.panel + " " + styles.form} aria-label="Competition information" aria-busy={pending} noValidate onSubmit={event => void submit(event)}>
      <h2>Event details</h2><p className={styles.help}>Name, date, and participant capacity are required.</p>
      <fieldset className={styles.fields} disabled={pending}>
        <legend className={styles.hidden}>Competition information</legend>
        {gyms.length > 1 ? <div><label htmlFor="competition-gymId">Competition gym</label>
          <select {...fieldProps("gymId")} required onChange={event => change("gymId", event.target.value)}>
            <option value="">Choose your gym</option>{gyms.map(assigned => <option key={assigned._id} value={assigned._id}>{assigned.name}</option>)}
          </select><FieldError field="gymId" errors={errors} /></div>
          : <div className={styles.gym}><span className={styles.help}>Competition gym</span><strong>{gyms[0].name}</strong><span>{gyms[0].location}</span></div>}
        <div><label htmlFor="competition-name">Competition name</label>
          <input {...fieldProps("name")} required maxLength={COMPETITION_NAME_MAX_LENGTH} autoComplete="off" placeholder="e.g. Autumn Bouldering Open" onChange={event => change("name", event.target.value)} />
          <FieldError field="name" errors={errors} /></div>
        <div className={styles.dateCapacity}>
          <div><label htmlFor="competition-date">Event date</label>
            <input {...fieldProps("date", "competition-date-help")} type="date" required min={bounds.min} max={bounds.max} onChange={event => change("date", event.target.value)} />
            <p id="competition-date-help" className={styles.help}>Today or later, within two years. Dates use Toronto time.</p><FieldError field="date" errors={errors} /></div>
          <div><label htmlFor="competition-capacity">Participant capacity</label>
            <input {...fieldProps("capacity", "competition-capacity-help")} type="number" inputMode="numeric" required min={1} max={COMPETITION_MAX_CAPACITY} step={1} placeholder="80" onChange={event => change("capacity", event.target.value)} />
            <p id="competition-capacity-help" className={styles.help}>1–1,000 participants.</p><FieldError field="capacity" errors={errors} /></div>
        </div>
        <div><label htmlFor="competition-location">Location <span className={styles.optional}>(optional)</span></label>
          <input {...fieldProps("location", "competition-location-help")} maxLength={COMPETITION_LOCATION_MAX_LENGTH} placeholder={gym?.location ?? "Competition address or venue"} onChange={event => change("location", event.target.value)} />
          <p id="competition-location-help" className={styles.help}>Leave blank to use {gym ? gym.name + "'s location: " + gym.location : "the selected gym's location"}.</p><FieldError field="location" errors={errors} /></div>
        <div><label htmlFor="competition-description">Description <span className={styles.optional}>(optional)</span></label>
          <textarea {...fieldProps("description", "competition-description-help")} rows={5} maxLength={COMPETITION_DESCRIPTION_MAX_LENGTH} placeholder="Tell climbers what to expect at your event." onChange={event => change("description", event.target.value)} />
          <p id="competition-description-help" className={styles.counter}>{values.description.length.toLocaleString("en-CA")} / 2,000 characters</p><FieldError field="description" errors={errors} /></div>
      </fieldset>
      {message && <div role="alert" className={styles.error}><p>{message}</p>{unconfirmed && <Link to={dashboardPath + "#competitions"}>Check competition list</Link>}</div>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>{pending ? "Saving competition…" : "Create competition"}</button>
        <Link to={dashboardPath} aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }}>Cancel</Link>
      </div>
      {pending && <p role="status" className={styles.help}>Saving your competition…</p>}
    </form>
    <aside className={workspace.panel + " " + styles.guide} aria-label="Before you save">
      <p className={workspace.eyebrow}>Competition setup</p><h2>Start with a draft</h2>
      <p>Your competition starts as a draft with registration closed.</p>
      <p>Save the basics now, then view the competition from your gym dashboard.</p>
      <div className={styles.tip}><strong>Connected to your gym</strong><p>Your event belongs to an active gym assigned to your account.</p></div>
    </aside>
  </div>;
}

function FieldError({ field, errors }: { field: CompetitionField; errors: CompetitionFieldErrors }) {
  return errors[field] ? <p id={"competition-" + field + "-error"} className={styles.fieldError}>{errors[field]}</p> : null;
}
