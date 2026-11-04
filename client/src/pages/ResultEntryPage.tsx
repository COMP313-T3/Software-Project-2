import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ResultInputControls, ConfirmResult } from "../components/gym-admin/ResultInputControls.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { getResultOptions, getOfficialResult, recordOfficialAttempt, saveOfficialResult, type ResultEntry, type ResultIdentity, type ResultOptions } from "../lib/resultsApi.ts";
import { entryBlocker, resultClimberName, resultProblem, resultRouteName, type ResultAction, type ResultFields } from "../lib/resultEntry.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./ResultEntryPage.module.css";

/** US-019 / #167, #168 -> FR-010 -> AC-014, AC-015. Writes remain official server operations. */
export default function ResultEntryPage() {
  const { user } = useSession(), { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  return <ResultWorkspace key={user.userId + ":" + competitionId} competitionId={competitionId} />;
}
function ResultWorkspace({ competitionId }: { competitionId: string }) {
  const [params, setParams] = useSearchParams();
  const climberId = params.get("climberId") ?? "", routeId = params.get("routeId") ?? "";
  const [revision, setRevision] = useState(0), [busyKey, setBusyKey] = useState<string | null>(null);
  const [read, setRead] = useState<{ revision: number; data: ResultOptions | null; error: unknown }>({ revision: -1, data: null, error: null });
  const editorKey = JSON.stringify([competitionId, climberId, routeId, revision]);
  const onBusy = useCallback((busy: boolean) => setBusyKey(current => busy ? editorKey : current === editorKey ? null : current), [editorKey, setBusyKey]);
  const onDenied = useCallback((error: unknown) => setRead({ revision, data: null, error }), [revision, setRead]);
  const busy = busyKey === editorKey, loading = read.revision !== revision, data = loading ? null : read.data;
  const path = "/gym-admin/competitions/" + encodeURIComponent(competitionId);
  const back = new URLSearchParams(params); back.delete("climberId"); back.delete("routeId");
  const backSearch = back.size ? "?" + back : "";
  useEffect(() => {
    const controller = new AbortController();
    getResultOptions(competitionId, controller.signal).then(data => { if (!controller.signal.aborted) setRead({ revision, data, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setRead({ revision, data: null, error }); });
    return () => controller.abort();
  }, [competitionId, revision]);
  const refresh = () => { if (!busy) setRevision(value => value + 1); };
  const climber = data?.climbers.find(item => item._id === climberId), route = data?.routes.find(item => item._id === routeId);
  function select(field: "climberId" | "routeId", value: string) {
    if (busy) return;
    const next = new URLSearchParams(params); if (value) next.set(field, value); else next.delete(field); setParams(next);
  }
  return <AppLayout title="Result entry"><title>Result Entry | TopSend</title>
    <div className={workspace.intro}><div className={workspace.introText}><Link className={workspace.back} to={path + backSearch}>Back to competition</Link>
      <p>Select a registered Climber and boulder problem to record their official result.</p></div>
      <button type="button" className={workspace.secondary} disabled={loading || busy} onClick={refresh}>Refresh entry</button></div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status">Loading result entry…</p></section>
      : read.error ? <section className={workspace.panel}><ReadError error={read.error} onRetry={refresh} /></section>
        : data && <>
          <section className={workspace.panel} aria-labelledby="entry-competition"><h2 id="entry-competition">{data.competition.name}</h2>
            <p className={styles.help}><time dateTime={data.competition.date}>{formatCalendarDate(data.competition.date)}</time> · {data.competition.status.toLowerCase()}</p>
            {!data.canRecord.allowed && <div className={styles.warning} role="status"><h3>Results cannot be recorded yet</h3>
              {data.canRecord.reasons.length ? <ul>{data.canRecord.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>Result entry is unavailable for this competition.</p>}
              <div className={styles.setupLinks}><Link to={path + "/scoring" + backSearch}>Scoring format</Link><Link to={path + "/routes" + backSearch}>Boulder problems</Link><Link to={path + "/divisions" + backSearch}>Divisions and climbers</Link></div></div>}
            <fieldset className={styles.fieldset} disabled={busy}><legend className={styles.hidden}>Select result entry</legend><div className={styles.fields}>
              <div><label htmlFor="result-climber">Registered Climber</label><select id="result-climber" value={climberId} disabled={data.climbers.length === 0} onChange={event => select("climberId", event.target.value)}>
                <option value="">Choose a Climber</option>{climberId && !climber && <option value={climberId} disabled>Unavailable Climber</option>}
                {data.climbers.map(item => <option key={item._id} value={item._id}>{resultClimberName(item)}{item.division ? " — " + item.division.name : ""} · {item._id.slice(-6)}</option>)}</select>
                {!data.climbers.length && <p className={styles.help}>No Climbers have a confirmed registration for this competition.</p>}
                {climberId && !climber && <p className={styles.errorText} role="alert">The selected Climber is unavailable. Choose a currently registered Climber.</p>}</div>
              <div><label htmlFor="result-route">Boulder problem</label><select id="result-route" value={routeId} disabled={data.routes.length === 0} onChange={event => select("routeId", event.target.value)}>
                <option value="">Choose a problem</option>{routeId && !route && <option value={routeId} disabled>Unavailable problem</option>}
                {data.routes.map(item => <option key={item._id} value={item._id} disabled={item.pointValue === null}>{resultRouteName(item)} · {item.pointValue === null ? "Points not set" : item.pointValue + " points"}</option>)}</select>
                {!data.routes.length && <p className={styles.help}>No boulder problems have been added to this competition.</p>}
                {routeId && !route && <p className={styles.errorText} role="alert">The selected problem is unavailable. Choose a problem from this competition.</p>}</div>
            </div></fieldset>
            <p className={styles.help}>Only confirmed registrations are listed. Changing the Climber or problem discards unsaved input.</p>
            <div className={styles.selection} aria-label="Selected Climber and boulder problem"><div><span>Selected Climber</span><strong>{climber ? resultClimberName(climber) : "Choose a Climber"}</strong>{climber?.division && <small>{climber.division.name}</small>}</div>
              <div><span>Selected problem</span><strong>{route ? resultRouteName(route) : "Choose a problem"}</strong>{route && <small>{route.pointValue === null ? "Points not set" : route.pointValue + " points"}</small>}</div></div>
          </section>
          {climber && route ? <ResultEditor key={editorKey} ids={{ competitionId, climberId, routeId }} options={data} onBusy={onBusy} onDenied={onDenied} onRefresh={refresh} />
            : <p className={styles.help} role="status">Choose both a Climber and a boulder problem to load the saved result.</p>}
        </>}
  </AppLayout>;
}

function ResultEditor({ ids, options, onBusy, onDenied, onRefresh }: {
  ids: ResultIdentity; options: ResultOptions; onBusy: (busy: boolean) => void; onDenied: (error: unknown) => void; onRefresh: () => void;
}) {
  const [read, setRead] = useState<{ data: ResultEntry | null; error: unknown }>({ data: null, error: null });
  const [action, setAction] = useState<ResultAction | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null), [fields, setFields] = useState<ResultFields>({});
  const mutation = useRef<AbortController | null>(null);
  const { competitionId, climberId, routeId } = ids;
  useEffect(() => {
    const controller = new AbortController();
    getOfficialResult({ competitionId, climberId, routeId }, controller.signal).then(data => { if (!controller.signal.aborted) setRead({ data, error: null }); })
      .catch(error => { if (controller.signal.aborted) return; if (error instanceof ApiError && [401, 403].includes(error.status)) onDenied(error); else setRead({ data: null, error }); });
    return () => controller.abort();
  }, [competitionId, climberId, routeId, onDenied]);
  useEffect(() => () => { mutation.current?.abort(); onBusy(false); }, [onBusy]);
  const entry = read.data;
  async function confirm() {
    if (mutation.current || !entry || !action || uncertain || entryBlocker(options, entry)) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); onBusy(true); setFields({}); setFeedback(null);
    try {
      const saved = action.kind === "save" ? await saveOfficialResult(ids, action.input, controller.signal) : await recordOfficialAttempt(ids, action.sent, controller.signal);
      if (controller.signal.aborted) return;
      setRead({ data: saved, error: null }); setFeedback({ message: action.kind === "save" ? "Official result saved." : "Attempt recorded and saved.", error: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { onDenied(error); return; }
      if (error instanceof ApiError && [400, 409, 429].includes(error.status)) {
        setFields(error.fields ?? {}); setFeedback({ message: resultProblem(error, "The result was not saved."), error: true });
        if (error.status === 409) setUncertain(true);
      } else {
        setUncertain(true); setFeedback({ message: "Couldn't confirm whether this result was saved. Refresh entry before recording another attempt or saving again.", error: true });
      }
    } finally {
      if (!controller.signal.aborted) { mutation.current = null; setBusy(false); onBusy(false); setAction(null); }
    }
  }
  if (read.error) return <section className={workspace.panel}><ReadError error={read.error} onRetry={onRefresh} /></section>;
  if (!entry) return <section className={workspace.panel} aria-busy="true"><p role="status">Loading selected result…</p></section>;
  const blocker = entryBlocker(options, entry), result = entry.result;
  const formKey = JSON.stringify([result?.resultId, result?.attempts, result?.sent, result?.updatedAt, entry.scoring?.maxAttempts]);
  return <>
    {feedback && <p className={feedback.error ? styles.warning : styles.success} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
    {uncertain && <p className={styles.help}>Recording is paused. Use Refresh entry to read the current saved result and competition information.</p>}
    <section className={workspace.panel} aria-labelledby="saved-result-title"><h2 id="saved-result-title">Saved official result</h2>
      {!result && <p className={styles.help}>No result has been recorded for this Climber on this problem.</p>}
      <dl className={styles.facts}>
        <div><dt>Attempts recorded</dt><dd>{result ? result.attempts : "Not recorded"}</dd></div>
        <div><dt>Send status</dt><dd>{result ? result.sent ? "Sent" : "Not sent" : "Not recorded"}</dd></div>
        {options.scoring?.records.flash && <div><dt>Flash</dt><dd>{result ? result.flash ? "Yes" : "No" : "Not recorded"}</dd></div>}
        <div><dt>Official score for this problem</dt><dd>{result ? result.officialScore + " points" : "Not recorded"}</dd></div>
        <div><dt>Attempts remaining</dt><dd>{entry.attemptsLeft}</dd></div><div><dt>Climber's competition total</dt><dd>{entry.climberTotal.totalScore} points</dd></div>
      </dl>
      {result?.updatedAt && <p className={styles.help}>Last saved: {formatTorontoDateTime(result.updatedAt)}</p>}
      <p className={styles.help}>{entry.scoring?.label ?? "Scoring is not configured."}</p>
    </section>
    {blocker && <p className={styles.warning} role="status">{blocker}</p>}
    <ResultInputControls key={formKey} entry={entry} recordsFlash={options.scoring?.records.flash ?? false} disabled={busy || uncertain || Boolean(blocker)} errors={fields}
      onChange={() => { setFields({}); setFeedback(null); }} onReview={next => { if (!busy && !uncertain && !blocker) { setFeedback(null); setFields({}); setAction(next); } }} />
    {action && <ConfirmResult entry={entry} action={action} busy={busy} onCancel={() => { if (!mutation.current) setAction(null); }} onConfirm={() => void confirm()} />}
  </>;
}
function ReadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <div role="alert"><h2>Result entry unavailable</h2><p>{resultProblem(error, "Couldn't load result entry. Please try again.")}</p>
    <div className={styles.actions}><button type="button" className={workspace.secondary} onClick={onRetry}>Try again</button>{error instanceof ApiError && error.status === 401 && <Link className={workspace.secondary} to="/login">Sign in</Link>}</div></div>;
}
