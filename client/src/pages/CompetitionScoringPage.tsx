import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { competitionDateBounds } from "../lib/competitionValidation.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { FLASH_BONUS_MAX, getCompetitionScoring, listScoringFormats, saveCompetitionScoring, type CompetitionScoring, type ScoringFormatOption } from "../lib/scoringApi.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import formStyles from "./CreateCompetitionPage.module.css";
import styles from "./CompetitionScoringPage.module.css";

type Data = { competition: ManagedCompetitionDetails; formats: ScoringFormatOption[]; saved: CompetitionScoring };
type Errors = { format?: string; flashBonus?: string };
const readable = (error: unknown, fallback: string) => error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message : fallback;

/** US-018 #86/#87 -> FR-010: choose supported rules and display server-confirmed settings. */
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
        const [options, saved] = await Promise.all([listScoringFormats(controller.signal), getCompetitionScoring(competitionId, controller.signal)]);
        if (!controller.signal.aborted) setRead({ revision, data: { competition, formats: options.formats, saved }, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setRead({ revision, data: null, error });
      }
    }
    void load(); return () => controller.abort();
  }, [competitionId, revision]);
  return <AppLayout title="Scoring format">
    <title>Scoring Format | TopSend</title>
    <div className={workspace.intro}>
      <div className={workspace.introText}><Link className={workspace.back} to={competitionPath + search}>Back to competition</Link><p>Choose the official scoring format for this competition.</p></div>
      <button className={workspace.secondary} type="button" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Refresh scoring settings</button>
    </div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status">Loading scoring settings…</p></section>
      : read.error ? <section className={workspace.panel} role="alert"><h2>Scoring settings unavailable</h2><p>{readable(read.error, "Couldn't load scoring settings. Please try again.")}</p><button className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></section>
      : read.data && <ScoringEditor data={read.data} onBusy={setSaving} onDenied={error => setRead({ revision, data: null, error })} />}
  </AppLayout>;
}

function ScoringEditor({ data, onBusy, onDenied }: { data: Data; onBusy: (busy: boolean) => void; onDenied: (error: ApiError) => void }) {
  const { competition, formats } = data;
  const [saved, setSaved] = useState(data.saved);
  const [format, setFormat] = useState(data.saved.scoring?.format ?? "");
  const [bonus, setBonus] = useState(String(data.saved.scoring?.flashBonus ?? 0));
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(competition.status === "CANCELLED" ? "A cancelled competition's scoring can't be changed."
    : competition.date < competitionDateBounds().min ? "Scoring can't be changed after the competition date." : "");
  const request = useRef<AbortController | null>(null);
  const focus = useRef<"format" | "flashBonus" | "alert" | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const option = formats.find(item => item.format === format);
  const savedOption = formats.find(item => item.format === saved.scoring?.format);
  const dirty = format !== (saved.scoring?.format ?? "") || (option?.allowsFlashBonus && bonus !== String(saved.scoring?.flashBonus ?? 0));
  useEffect(() => () => { request.current?.abort(); onBusy(false); }, [onBusy]);
  useEffect(() => {
    if (pending || !focus.current) return;
    if (focus.current === "alert") alert.current?.focus();
    else form.current?.querySelector<HTMLElement>(`[name="${focus.current}"]`)?.focus();
    focus.current = null;
  }, [errors, message, pending]);
  useEffect(() => { if (success) status.current?.focus(); }, [success]);
  function choose(value: string) {
    setFormat(value); if (!formats.find(item => item.format === value)?.allowsFlashBonus) setBonus("0");
    setErrors({}); setMessage(""); setSuccess("");
  }
  function discard() { setFormat(saved.scoring?.format ?? ""); setBonus(String(saved.scoring?.flashBonus ?? 0)); setErrors({}); setMessage(""); setSuccess(""); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (request.current || locked) return;
    const next: Errors = {};
    if (!option) next.format = "Choose a supported scoring format.";
    const flashBonus = option?.allowsFlashBonus ? Number(bonus) : 0;
    if (option?.allowsFlashBonus && (!bonus.trim() || !Number.isInteger(flashBonus) || flashBonus < 0 || flashBonus > FLASH_BONUS_MAX)) next.flashBonus = `Enter a whole number from 0 to ${FLASH_BONUS_MAX}.`;
    setErrors(next); setMessage(""); setSuccess("");
    if (next.format || next.flashBonus) { focus.current = next.format ? "format" : "flashBonus"; return; }
    if (!dirty) return;
    const controller = new AbortController(); request.current = controller; setPending(true); onBusy(true);
    try {
      const updated = await saveCompetitionScoring(competition._id, { format, flashBonus }, controller.signal);
      if (controller.signal.aborted) return;
      setSaved(updated); setFormat(updated.scoring?.format ?? ""); setBonus(String(updated.scoring?.flashBonus ?? 0)); setSuccess("Scoring format saved.");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onDenied(error); return; }
      const nextErrors: Errors = {};
      if (error instanceof ApiError) for (const field of ["format", "flashBonus"] as const) if (error.fields?.[field]) nextErrors[field] = error.fields[field];
      setErrors(nextErrors); focus.current = nextErrors.format ? "format" : nextErrors.flashBonus ? "flashBonus" : "alert";
      if (error instanceof ApiError && ["COMPETITION_CANCELLED", "COMPETITION_FINISHED"].includes(error.code)) setLocked(error.message);
      setMessage(readable(error, "Couldn't confirm the save. Your selection is preserved. Refresh scoring settings to check the saved format before trying again."));
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); onBusy(false); }
    }
  }
  const savedAt = saved.scoring?.updatedAt ? new Date(saved.scoring.updatedAt) : null;
  return <>
    <section className={workspace.panel + " " + styles.context} aria-label="Selected competition"><span>Selected competition</span><strong>{competition.name}</strong><p>{formatCalendarDate(competition.date)}{competition.gym?.name ? ` at ${competition.gym.name}` : ""}</p></section>
    <div className={styles.grid}>
      <section className={workspace.panel} aria-label="Saved scoring format">
        <h2>Current saved format</h2>
        <p className={styles.savedName}>{saved.scoring ? savedOption?.label ?? saved.scoring.format : "Not configured"}</p>
        {saved.scoring ? <>{savedOption && <p>{savedOption.description}</p>}{savedOption?.allowsFlashBonus && <p>Flash bonus: <strong>{saved.scoring.flashBonus} points</strong></p>}
          {savedAt && !Number.isNaN(savedAt.getTime()) && <p className={styles.help}>Last saved <time dateTime={saved.scoring.updatedAt}>{formatTorontoDateTime(saved.scoring.updatedAt!)}</time></p>}</>
          : <p>Choose a format and save it before entering results.</p>}
        <p className={styles.help}>Only a successful save updates this summary. The saved format applies to this competition's Climbers.</p>
        {saved.readiness.warnings.length > 0 && <div className={styles.readiness}><h3>Before entering results</h3><ul>{saved.readiness.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      </section>
      <form ref={form} className={workspace.panel + " " + styles.editor} aria-label="Configure scoring format" aria-busy={pending} onSubmit={event => void save(event)} noValidate>
        <h2>Choose scoring format</h2><p className={styles.help}>Select one of the supported formats below, then save your choice.</p>
        {locked && <p role="status" className={styles.notice}>{locked}</p>}
        {!formats.length && <p role="alert">No scoring formats are available. Refresh settings to try again.</p>}
        <fieldset className={styles.fields} disabled={pending || !!locked || !formats.length}><legend className={formStyles.hidden}>Supported scoring formats</legend>
          <div className={styles.formats}>{formats.map((item, index) => <label className={styles.option} data-selected={format === item.format} key={item.format}>
            <input type="radio" name="format" value={item.format} checked={format === item.format} onChange={() => choose(item.format)} aria-invalid={!!errors.format} aria-labelledby={`format-label-${index}`} aria-describedby={`format-description-${index}${errors.format ? " format-error" : ""}`} />
            <span><strong id={`format-label-${index}`}>{item.label}</strong><span id={`format-description-${index}`}>{item.description}</span></span>
          </label>)}</div>
          {errors.format && <p id="format-error" className={formStyles.fieldError}>{errors.format}</p>}
          {option?.allowsFlashBonus && <div className={styles.bonus}><label htmlFor="scoring-bonus">Flash bonus (points)</label><input id="scoring-bonus" name="flashBonus" type="number" min={0} max={FLASH_BONUS_MAX} step={1} value={bonus} aria-invalid={!!errors.flashBonus} aria-describedby={`bonus-help${errors.flashBonus ? " bonus-error" : ""}`} onChange={event => { setBonus(event.target.value); setErrors(current => ({ ...current, flashBonus: undefined })); setMessage(""); setSuccess(""); }} /><p id="bonus-help" className={styles.help}>A whole number from 0 to {FLASH_BONUS_MAX}. Use 0 for no flash bonus.</p>{errors.flashBonus && <p id="bonus-error" className={formStyles.fieldError}>{errors.flashBonus}</p>}</div>}
        </fieldset>
        {message && <div role="alert" ref={alert} tabIndex={-1} className={formStyles.error}>{message}</div>}
        {success && <p role="status" ref={status} tabIndex={-1} className={formStyles.success}>{success}</p>}
        <div className={formStyles.actions}><button className={formStyles.primary} type="submit" disabled={pending || !!locked || !formats.length || !dirty}>{pending ? "Saving format…" : "Save scoring format"}</button><button type="button" className={workspace.secondary} disabled={pending || !dirty} onClick={discard}>Discard changes</button></div>
        {pending && <p role="status">Saving scoring format…</p>}
      </form>
    </div>
  </>;
}
