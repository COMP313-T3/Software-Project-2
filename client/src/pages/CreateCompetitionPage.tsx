import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import CompetitionLocation from "../components/gym-admin/CompetitionLocation.tsx";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import { describeScoring } from "../components/gym-admin/scoringText.ts";
import {
  COMPETITION_DESCRIPTION_MAX_LENGTH,
  COMPETITION_MAX_CAPACITY, COMPETITION_NAME_MAX_LENGTH,
} from "../constants/competitions.ts";
import {
  SCORING_ATTEMPTS_MAX, SCORING_DEDUCTION_MAX, SCORING_DEFAULT_ATTEMPTS, SCORING_DEFAULT_DEDUCTION,
} from "../constants/scoring.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate } from "../lib/dateFormat.ts";
import {
  COMPETITION_FIELD_ORDER, competitionDateBounds, validateCompetitionForm,
  type CompetitionField, type CompetitionFieldErrors, type CompetitionFormValues,
} from "../lib/competitionValidation.ts";
import {
  createManagedCompetition, fetchGymAdminDashboard,
  type ManagedCompetitionDetails, type ManagedGym,
} from "../lib/gymAdminApi.ts";
import { savedScoring } from "../lib/scoringValidation.ts";
import styles from "./CreateCompetitionPage.module.css";

function readError(error: unknown) {
  return error instanceof ApiError && error.status > 0 && error.status < 500
    ? error.message : "Couldn't load your assigned gyms. Please try again.";
}

/** Create competition page (US-012, FR-004, AC-007). The server decides which gyms the user may
 * use, whatever this page shows. */
export default function CreateCompetitionPage() {
  const { user } = useSession();
  const location = useLocation();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  return <CreateWorkspace key={user.userId + location.search} />;
}

function CreateWorkspace() {
  const location = useLocation();
  const [search] = useSearchParams();
  const dashboardPath = "/dashboard" + location.search;
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; gyms: ManagedGym[] | null; error: unknown }>({
    revision: -1, gyms: null, error: null,
  });
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
  useEffect(() => { document.getElementById("main-content")?.scrollIntoView?.({ block: "start" }); }, []);

  return <AppLayout title="Create competition">
    <title>Create Competition | TopSend</title>
    <div className={workspace.intro}>
      <div className={workspace.introText}>
        <Link className={workspace.back} to={dashboardPath}>Back to dashboard</Link>
        <p>Start with the event details. Your gym is connected when you save.</p>
      </div>
    </div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status" className={workspace.muted}>Loading your assigned gyms…</p></section>
      : read.error ? <section className={workspace.panel} role="alert">
        <h2>Competition form unavailable</h2><p>{readError(read.error)}</p>
        <button type="button" className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button>
      </section>
      : !read.gyms?.length ? <section className={workspace.panel} role="alert">
        <h2>No active gym assigned</h2><p>Your account needs an active gym assignment before you can create a competition. Contact a System Administrator.</p>
      </section>
      : <CompetitionForm gyms={read.gyms} suggestedGymId={search.get("gymId") ?? ""} dashboardPath={dashboardPath} />}
  </AppLayout>;
}

function CompetitionForm({ gyms, suggestedGymId, dashboardPath }: {
  gyms: ManagedGym[]; suggestedGymId: string; dashboardPath: string;
}) {
  function initialValues(): CompetitionFormValues {
    return {
      gymId: gyms.length === 1 ? gyms[0]._id : gyms.find(gym => gym._id === suggestedGymId)?._id ?? "",
      name: "", date: "", description: "", capacity: "",
      deductionPercent: String(SCORING_DEFAULT_DEDUCTION), maxAttempts: String(SCORING_DEFAULT_ATTEMPTS),
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
    // The largest deduction depends on the attempts, so changing them clears the deduction's message too.
    setErrors(current => ({ ...current, [field]: undefined, ...(field === "maxAttempts" ? { deductionPercent: undefined } : {}) }));
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
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        ...(gyms.length > 1 ? { gymId: values.gymId } : {}),
        deductionPercent: Number(values.deductionPercent), maxAttempts: Number(values.maxAttempts),
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
    <h2>Gym access unavailable</h2><p>{accessError}</p><Link className={workspace.secondary} to={dashboardPath}>Back to dashboard</Link>
  </section>;

  if (created) {
    const createdScoring = savedScoring(created.scoring);
    const listPath = "/dashboard?gymId=" + encodeURIComponent(created.gymId) + "#competitions";
    const detailsPath = "/gym-admin/competitions/" + encodeURIComponent(created._id) + "?gymId=" + encodeURIComponent(created.gymId);
    return <section className={workspace.panel} aria-label="Created competition">
      <div className={styles.success} role="status"><h2 ref={successHeading} tabIndex={-1}>Competition created</h2>
        <p>{created.name} was saved for {created.gym?.name ?? "your gym"}.</p></div>
      <dl className={workspace.details}>
        <div><dt>Gym</dt><dd>{created.gym?.name ?? "Your gym"}</dd></div>
        <div><dt>Date</dt><dd><time dateTime={created.date}>{formatCalendarDate(created.date)}</time></dd></div>
        <div><dt>Location</dt><dd>{created.location}</dd></div>
        <div><dt>Participant capacity</dt><dd>{created.capacity}</dd></div>
        {createdScoring && <div><dt>Scoring format</dt><dd>{describeScoring(createdScoring)}</dd></div>}
        <div><dt>Status</dt><dd>{created.status === "DRAFT" ? "Draft" : created.status === "PUBLISHED" ? "Published" : "Cancelled"}</dd></div>
        <div><dt>Registration</dt><dd>{created.registrationStatus === "OPEN" ? "Open" : "Closed"}</dd></div>
      </dl>
      {created.description && <p className={workspace.description}>{created.description}</p>}
      <div className={styles.actions}><Link className={styles.primary} to={detailsPath}>View competition</Link><Link to={listPath}>Back to competitions</Link>
        <button type="button" onClick={() => { setValues(initialValues()); setErrors({}); setCreated(null); }}>Create another competition</button></div>
    </section>;
  }

  return <div className={styles.grid}>
    <form className={workspace.panel + " " + styles.form} aria-label="Competition information" aria-busy={pending} noValidate onSubmit={event => void submit(event)}>
      <h2>Event details</h2><p className={styles.help}>Name, date, participant capacity, and scoring are required.</p>
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
        <CompetitionLocation location={gym?.location ?? null} />
        <div><label htmlFor="competition-description">Description <span className={styles.optional}>(optional)</span></label>
          <textarea {...fieldProps("description", "competition-description-help")} rows={5} maxLength={COMPETITION_DESCRIPTION_MAX_LENGTH} placeholder="Tell climbers what to expect at your event." onChange={event => change("description", event.target.value)} />
          <p id="competition-description-help" className={styles.counter}>{values.description.length.toLocaleString("en-CA")} / 2,000 characters</p><FieldError field="description" errors={errors} /></div>
        <fieldset className={styles.scoring} aria-describedby="competition-scoring-help"><legend>Scoring</legend>
          <p id="competition-scoring-help" className={styles.help}>A top on the first attempt scores the problem's point value. You can change these settings later from the competition's scoring page.</p>
          <div className={styles.dateCapacity}>
            <div><label htmlFor="competition-deductionPercent">Deduction per failed attempt (%)</label>
              <input {...fieldProps("deductionPercent", "competition-deductionPercent-help")} type="number" inputMode="numeric" required min={0} max={SCORING_DEDUCTION_MAX} step={1} onChange={event => change("deductionPercent", event.target.value)} />
              <p id="competition-deductionPercent-help" className={styles.help}>From 0 to {SCORING_DEDUCTION_MAX}. The share of the problem's points taken off for each failed attempt before a top.</p><FieldError field="deductionPercent" errors={errors} /></div>
            <div><label htmlFor="competition-maxAttempts">Maximum attempts per problem</label>
              <input {...fieldProps("maxAttempts", "competition-maxAttempts-help")} type="number" inputMode="numeric" required min={1} max={SCORING_ATTEMPTS_MAX} step={1} onChange={event => change("maxAttempts", event.target.value)} />
              <p id="competition-maxAttempts-help" className={styles.help}>From 1 to {SCORING_ATTEMPTS_MAX}. A problem not topped within this many attempts scores 0.</p><FieldError field="maxAttempts" errors={errors} /></div>
          </div>
        </fieldset>
      </fieldset>
      {message && <div role="alert" className={styles.error}><p>{message}</p>{unconfirmed && <Link to={dashboardPath + "#competitions"}>Check competition list</Link>}</div>}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>{pending ? "Saving competition…" : "Create competition"}</button>
        <Link to={dashboardPath} aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }}>Cancel</Link>
      </div>
      {pending && <p role="status" className={styles.help}>Saving your competition…</p>}
    </form>
    <aside className={workspace.panel + " " + styles.guide} aria-label="Before you save">
      <h2>Start with a draft</h2>
      <p>Your competition starts as a draft with registration closed.</p>
      <p>When you're ready, open registration from its details page. That publishes it, so climbers can find it.</p>
      <p>Save the basics now, then view the competition from your gym dashboard.</p>
      <div className={styles.tip}><strong>Connected to your gym</strong><p>Your event belongs to an active gym assigned to your account.</p></div>
    </aside>
  </div>;
}

function FieldError({ field, errors }: { field: CompetitionField; errors: CompetitionFieldErrors }) {
  return errors[field] ? <p id={"competition-" + field + "-error"} className={styles.fieldError}>{errors[field]}</p> : null;
}
