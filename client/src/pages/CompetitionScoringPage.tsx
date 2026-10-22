import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { describeScoring, scoringExample } from "../components/gym-admin/scoringText.ts";
import { SCORING_ATTEMPTS_MAX, SCORING_DEDUCTION_MAX, SCORING_DEFAULT_ATTEMPTS, SCORING_DEFAULT_DEDUCTION } from "../constants/scoring.ts";
import { ApiError } from "../lib/apiClient.ts";
import { competitionDateBounds } from "../lib/competitionValidation.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { getCompetitionScoring, saveCompetitionScoring, type CompetitionScoring, type SavedScoring } from "../lib/scoringApi.ts";
import { SCORING_FIELDS, savedScoring, validateScoring, type ScoringErrors, type ScoringField, type ScoringValues } from "../lib/scoringValidation.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import formStyles from "./CreateCompetitionPage.module.css";
import styles from "./CompetitionScoringPage.module.css";

type Data = { competition: ManagedCompetitionDetails; saved: CompetitionScoring };
const readable = (error: unknown, fallback: string) => error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message : fallback;
/** The saved settings as form values, or the values a competition starts with when none are saved. */
const valuesOf = (scoring: SavedScoring | null): ScoringValues => scoring
  ? { deductionPercent: String(scoring.deductionPercent), maxAttempts: String(scoring.maxAttempts) }
  : { deductionPercent: String(SCORING_DEFAULT_DEDUCTION), maxAttempts: String(SCORING_DEFAULT_ATTEMPTS) };

/** US-018 #86/#87 -> FR-010: set the competition's scoring and display server-confirmed settings. */
export default function CompetitionScoringPage() {
  const { user } = useSession();
  const { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  return <ScoringWorkspace key={user.userId + ":" + competitionId} competitionId={competitionId} />;
}

function ScoringWorkspace({ competitionId }: { competitionId: string }) {
  const { search } = useLocation();
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [read, setRead] = useState<{ revision: number; data: Data | null; error: unknown }>({ revision: -1, data: null, error: null });
  const loading = read.revision !== revision;
  const competitionPath = `/gym-admin/competitions/${encodeURIComponent(competitionId)}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const competition = await getManagedCompetition(competitionId, controller.signal);
        if (controller.signal.aborted) return;
        const saved = await getCompetitionScoring(competitionId, controller.signal);
        if (!controller.signal.aborted) setRead({ revision, data: { competition, saved }, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setRead({ revision, data: null, error });
      }
    }
    void load(); return () => controller.abort();
  }, [competitionId, revision]);
  return <AppLayout title="Scoring format">
    <title>Scoring Format | TopSend</title>
    <div className={workspace.intro}>
      <div className={workspace.introText}><Link className={workspace.back} to={competitionPath + search}>Back to competition</Link><p>Set how this competition's problems are scored.</p></div>
      <button className={workspace.secondary} type="button" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Refresh scoring settings</button>
    </div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status">Loading scoring settings…</p></section>
      : read.error ? <section className={workspace.panel} role="alert"><h2>Scoring settings unavailable</h2><p>{readable(read.error, "Couldn't load scoring settings. Please try again.")}</p><button className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></section>
      : read.data && <ScoringEditor data={read.data} onBusy={setSaving} onDenied={error => setRead({ revision, data: null, error })} />}
  </AppLayout>;
}

function ScoringEditor({ data, onBusy, onDenied }: { data: Data; onBusy: (busy: boolean) => void; onDenied: (error: ApiError) => void }) {
  const { competition } = data;
  const [saved, setSaved] = useState(data.saved);
  const [values, setValues] = useState(() => valuesOf(savedScoring(data.saved.scoring)));
  const [errors, setErrors] = useState<ScoringErrors>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(competition.status === "CANCELLED" ? "A cancelled competition's scoring can't be changed."
    : competition.date < competitionDateBounds().min ? "Scoring can't be changed after the competition date." : "");
  const request = useRef<AbortController | null>(null);
  const focus = useRef<ScoringField | "alert" | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const settings = savedScoring(saved.scoring);
  const initial = valuesOf(settings);
  const changed = SCORING_FIELDS.some(field => values[field].trim() !== initial[field]);
  // A competition without saved scoring can save the values the form starts with.
  const dirty = !settings || changed;
  useEffect(() => () => { request.current?.abort(); onBusy(false); }, [onBusy]);
  useEffect(() => {
    if (pending || !focus.current) return;
    if (focus.current === "alert") alert.current?.focus();
    else form.current?.querySelector<HTMLElement>(`[name="${focus.current}"]`)?.focus();
    focus.current = null;
  }, [errors, message, pending]);
  useEffect(() => { if (success) status.current?.focus(); }, [success]);
  function change(field: ScoringField, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    // The largest deduction depends on the attempts, so changing them clears the deduction's message too.
    setErrors(current => ({ ...current, [field]: undefined, ...(field === "maxAttempts" ? { deductionPercent: undefined } : {}) }));
    setMessage(""); setSuccess("");
  }
  function discard() { setValues(initial); setErrors({}); setMessage(""); setSuccess(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (request.current || locked) return;
    const next = validateScoring(values);
    setErrors(next); setMessage(""); setSuccess("");
    const invalid = SCORING_FIELDS.find(field => next[field]);
    if (invalid) { focus.current = invalid; return; }
    if (!dirty) return;
    const controller = new AbortController(); request.current = controller; setPending(true); onBusy(true);
    try {
      const updated = await saveCompetitionScoring(competition._id, { deductionPercent: Number(values.deductionPercent), maxAttempts: Number(values.maxAttempts) }, controller.signal);
      if (controller.signal.aborted) return;
      setSaved(updated); setValues(valuesOf(savedScoring(updated.scoring))); setSuccess("Scoring format saved.");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onDenied(error); return; }
      const nextErrors: ScoringErrors = {};
      if (error instanceof ApiError) for (const field of SCORING_FIELDS) if (error.fields?.[field]) nextErrors[field] = error.fields[field];
      setErrors(nextErrors); focus.current = SCORING_FIELDS.find(field => nextErrors[field]) ?? "alert";
      if (error instanceof ApiError && ["COMPETITION_CANCELLED", "COMPETITION_FINISHED"].includes(error.code)) setLocked(error.message);
      setMessage(readable(error, "Couldn't confirm the save. Your changes are preserved. Refresh scoring settings to check the saved format before trying again."));
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); onBusy(false); }
    }
  }
  function described(field: ScoringField) { return `scoring-${field}-help${errors[field] ? ` scoring-${field}-error` : ""}`; }
  const savedAt = settings?.updatedAt ? new Date(settings.updatedAt) : null;
  return <>
    <section className={workspace.panel + " " + styles.context} aria-label="Selected competition"><span>Selected competition</span><strong>{competition.name}</strong><p>{formatCalendarDate(competition.date)}{competition.gym?.name ? ` at ${competition.gym.name}` : ""}</p></section>
    <div className={styles.grid}>
      <section className={workspace.panel} aria-label="Saved scoring format">
        <h2>Current saved format</h2>
        <p className={styles.savedName}>{settings ? describeScoring(settings) : "Not set"}</p>
        {settings ? <><p>{scoringExample(settings)}</p>
          {savedAt && !Number.isNaN(savedAt.getTime()) && <p className={styles.help}>Last saved <time dateTime={settings.updatedAt}>{formatTorontoDateTime(settings.updatedAt!)}</time></p>}</>
          : <p>Save the scoring format before entering results.</p>}
        <p className={styles.help}>Only a successful save updates this summary. The saved format applies to every problem and Climber in this competition.</p>
        {saved.readiness.warnings.length > 0 && <div className={styles.readiness}><h3>Before entering results</h3><ul>{saved.readiness.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      </section>
      <form ref={form} className={workspace.panel + " " + styles.editor} aria-label="Configure scoring format" aria-busy={pending} onSubmit={event => void save(event)} noValidate>
        <h2>Set scoring format</h2><p className={styles.help}>A top on the first attempt scores the problem's point value. Each failed attempt before the top takes the deduction off, and a problem not topped within the maximum attempts scores 0.</p>
        {locked && <p role="status" className={styles.notice}>{locked}</p>}
        <fieldset className={formStyles.fields} disabled={pending || !!locked}><legend className={formStyles.hidden}>Scoring settings</legend>
          <div><label htmlFor="scoring-deductionPercent">Deduction per failed attempt (%)</label>
            <input id="scoring-deductionPercent" name="deductionPercent" type="number" inputMode="numeric" required min={0} max={SCORING_DEDUCTION_MAX} step={1} value={values.deductionPercent} aria-invalid={!!errors.deductionPercent} aria-describedby={described("deductionPercent")} onChange={event => change("deductionPercent", event.target.value)} />
            <p id="scoring-deductionPercent-help" className={formStyles.help}>From 0 to {SCORING_DEDUCTION_MAX}. The share of the problem's points taken off for each failed attempt before a top.</p>
            {errors.deductionPercent && <p id="scoring-deductionPercent-error" className={formStyles.fieldError}>{errors.deductionPercent}</p>}</div>
          <div><label htmlFor="scoring-maxAttempts">Maximum attempts per problem</label>
            <input id="scoring-maxAttempts" name="maxAttempts" type="number" inputMode="numeric" required min={1} max={SCORING_ATTEMPTS_MAX} step={1} value={values.maxAttempts} aria-invalid={!!errors.maxAttempts} aria-describedby={described("maxAttempts")} onChange={event => change("maxAttempts", event.target.value)} />
            <p id="scoring-maxAttempts-help" className={formStyles.help}>From 1 to {SCORING_ATTEMPTS_MAX}. A problem not topped within this many attempts scores 0.</p>
            {errors.maxAttempts && <p id="scoring-maxAttempts-error" className={formStyles.fieldError}>{errors.maxAttempts}</p>}</div>
        </fieldset>
        {message && <div role="alert" ref={alert} tabIndex={-1} className={formStyles.error}>{message}</div>}
        {success && <p role="status" ref={status} tabIndex={-1} className={formStyles.success}>{success}</p>}
        <div className={formStyles.actions}><button className={formStyles.primary} type="submit" disabled={pending || !!locked || !dirty}>{pending ? "Saving format…" : "Save scoring format"}</button><button type="button" className={workspace.secondary} disabled={pending || !changed} onClick={discard}>Discard changes</button></div>
        {pending && <p role="status">Saving scoring format…</p>}
      </form>
    </div>
  </>;
}
