import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/apiClient.ts";
import { formatCalendarDate } from "../../lib/dateFormat.ts";
import {
  fetchGymAdminDashboard, getManagedCompetition, listManagedCompetitions,
  type CompetitionPeriod, type ManagedCompetition,
} from "../../lib/gymAdminApi.ts";
import AccessRequired from "../layout/AccessRequired.tsx";
import AppLayout from "../layout/AppLayout.tsx";
import { useSession } from "../session/sessionContext.ts";
import styles from "./GymAdminDashboard.module.css";
import CompetitionDetailsForm from "./CompetitionDetailsForm.tsx";
import SavedScoringSummary from "./SavedScoringSummary.tsx";

type Read<T> = ((signal: AbortSignal) => Promise<T>) | null;

/** Clear stale data when the filter/selection changes; aborted reads never update the page. */
function useRead<T>(read: Read<T>, revision = 0) {
  const [state, setState] = useState<{ read: Read<T>; revision: number; data: T | null; error: unknown; loading: boolean }>(
    { read, revision, data: null, error: null, loading: !!read },
  );
  useEffect(() => {
    const controller = new AbortController();
    if (read) read(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ read, revision, data, error: null, loading: false });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ read, revision, data: null, error, loading: false });
    });
    return () => controller.abort();
  }, [read, revision]);
  const current = state.read === read && state.revision === revision ? state : { data: null, error: null, loading: !!read };
  return { ...current, replace: (data: T) => setState({ read, revision, data, error: null, loading: false }), fail: (error: unknown) => setState({ read, revision, data: null, error, loading: false }) };
}

function problem(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
function competitionPath(id: string) {
  return `/gym-admin/competitions/${encodeURIComponent(id)}`;
}
const statusLabels = { DRAFT: "Draft", PUBLISHED: "Published", CANCELLED: "Cancelled" };

/** A count, or a placeholder while it loads or when it couldn't load, never a made-up zero. */
function Count({ value, loading }: { value: number | undefined; loading: boolean }) {
  if (value !== undefined) return <>{value.toLocaleString("en-CA")}</>;
  return loading
    ? <span className={styles.skeleton}><span className={styles.visuallyHidden}>Loading</span></span>
    : <span className={styles.unavailable}>Not available</span>;
}

/** Gym Admin workspace (US-011, US-013): the dashboard, the competition list, and one
 * competition's details. Other roles see a message; the server checks the role and the gym
 * assignment too. */
export default function GymAdminDashboard() {
  const { user } = useSession();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  return <GymWorkspace key={user.userId} />;
}

function GymWorkspace() {
  const { competitionId } = useParams();
  const location = useLocation();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const periodValue = search.get("period");
  const period: CompetitionPeriod = periodValue === "past" || periodValue === "all" ? periodValue : "upcoming";
  const gymId = search.get("gymId") ?? "";
  const requestedPage = Number(search.get("page") ?? "1");
  const createPath = "/gym-admin/competitions/new" + location.search;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const dashboardPath = `/dashboard${location.search}`;
  function updateFilters(values: { period?: CompetitionPeriod; gymId?: string; page?: number }) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) {
      if (value === "" || value === "upcoming" || (key === "page" && value === 1)) next.delete(key);
      else next.set(key, String(value));
    }
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
  }
  useEffect(() => {
    if (!location.hash) document.getElementById("main-content")?.scrollIntoView?.({ block: "start" });
  }, [location.pathname, location.hash]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const summary = useRead(competitionId ? null : fetchGymAdminDashboard, revision);
  useEffect(() => {
    if (location.hash === "#competitions" && !summary.loading) document.getElementById("competitions")?.scrollIntoView?.({ block: "start" });
  }, [location.hash, summary.loading]);
  const listRead = useCallback((signal: AbortSignal) => listManagedCompetitions({ period, gymId, page }, signal), [period, gymId, page]);
  const list = useRead(competitionId ? null : listRead, revision);
  const selectedRead = useCallback((signal: AbortSignal) => getManagedCompetition(competitionId ?? "", signal), [competitionId]);
  const selected = useRead(competitionId ? selectedRead : null, revision);
  const forbidden = [summary.error, list.error, selected.error].find(error => error instanceof ApiError && (error.status === 401 || error.status === 403));
  const loading = summary.loading || list.loading || selected.loading;
  const title = period === "upcoming" ? "Upcoming competitions" : period === "past" ? "Past competitions" : "All competitions";
  const next = summary.data?.upcoming[0];
  const pageTitle = competitionId ? selected.data?.name ?? "Competition details" : "Gym admin dashboard";
  function refresh() { setRevision(value => value + 1); }
  return <AppLayout title={pageTitle}>
    <title>{competitionId ? "Competition Details | TopSend" : "Gym Admin Dashboard | TopSend"}</title>
    <div className={styles.intro}>
      <div className={styles.introText}>
        {competitionId && <Link className={styles.back} to={`${dashboardPath}#competitions`}>Back to competitions</Link>}
        <p>{competitionId ? "Manage event information and registration for this competition." : "Plan your next event and keep your competitions in view."}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={refresh} disabled={loading || saving}>{competitionId ? "Refresh details" : "Refresh dashboard"}</button>
        {!competitionId && !forbidden && <Link className={styles.primary} to={createPath}>Create competition</Link>}
      </div>
    </div>
    {forbidden ? <section className={styles.panel} role="alert">
      <h2>Dashboard unavailable</h2>
      <p className={styles.muted}>{problem(forbidden, "Your gym access is unavailable.")}</p>
      <button type="button" className={styles.secondary} onClick={refresh} disabled={loading}>Try again</button>
    </section> : <>
      {!competitionId && <section className={styles.overview} aria-label="Competition overview" aria-busy={summary.loading}>
        {summary.loading && <p role="status" className={styles.visuallyHidden}>Loading gym overview…</p>}
        {!!summary.error && <div role="alert" className={styles.alert}><p>{problem(summary.error, "Couldn't load your gym overview. Please try again.")}</p><button type="button" className={styles.secondary} onClick={refresh}>Retry overview</button></div>}
        <dl className={styles.counts}>
          {([["Upcoming", summary.data?.counts.upcoming], ["Past", summary.data?.counts.past], ["Upcoming drafts", summary.data?.counts.drafts]] as const).map(([label, value]) => (
            <div className={styles.count} key={label}><dt>{label}</dt><dd><Count value={value} loading={summary.loading} /></dd></div>
          ))}
        </dl>
        {summary.data && <div className={styles.gymOverview}>
          <div className={styles.panel}>
            <h2>Your gyms</h2>
            <ul className={styles.gyms}>{summary.data.gyms.map(gym => <li key={gym._id}><strong>{gym.name}</strong><span>{gym.location}</span></li>)}</ul>
          </div>
          <div className={styles.panel}>
            <h2>Next competition</h2>
            {next ? <div className={styles.next}>
              <Link to={`${competitionPath(next._id)}${location.search}`}>{next.name}</Link>
              <p className={styles.muted}>{next.gym?.name ? `${formatCalendarDate(next.date)} at ${next.gym.name}` : formatCalendarDate(next.date)}</p>
            </div> : <p className={styles.muted}>No upcoming competitions.</p>}
          </div>
        </div>}
      </section>}
      {competitionId && <section id="selected-competition" className={styles.panel} aria-label="Selected competition" aria-busy={selected.loading}>
        <h2 id="competition-information">Competition information</h2>
        {selected.loading && <p role="status" className={styles.muted}>Loading selected competition…</p>}
        {!!selected.error && <div role="alert" className={styles.alert}><p>{problem(selected.error, "Couldn't load this competition. Please try again.")}</p><button type="button" className={styles.secondary} onClick={refresh}>Retry competition</button></div>}
        {selected.data && <>
          <SavedScoringSummary key={"scoring-" + selected.data._id} competition={selected.data} />
          <CompetitionDetailsForm key={selected.data._id} competition={selected.data} divisionsPath={competitionPath(selected.data._id) + "/divisions" + location.search} onSaved={selected.replace} onDenied={selected.fail} onBusy={setSaving} />
          <h3 className={styles.toolsTitle}>Management tools</h3>
          <ul className={styles.tools}>{selected.data.tools.filter(tool => tool.key !== "details").map(tool => tool.key === "divisions"
            ? <li key={tool.key}><Link className={styles.toolLink} to={competitionPath(selected.data!._id) + "/divisions" + location.search}>{tool.label}<small>Create divisions and organize registered climbers</small></Link></li>
            : tool.key === "routes" ? <li key={tool.key}><Link className={styles.toolLink} to={competitionPath(selected.data!._id) + "/routes" + location.search}>{tool.label}<small>See, add and edit the competition's routes</small></Link></li>
            : tool.key === "scoring" ? <li key={tool.key}><Link className={styles.toolLink} to={competitionPath(selected.data!._id) + "/scoring" + location.search}>{tool.label}<small>Choose and review the competition's scoring format</small></Link></li>
            : <li className={styles.unavailable} key={tool.key}>{tool.label}<small>Not available yet</small></li>)}</ul>
        </>}
      </section>}
      {!competitionId && <section id="competitions" className={styles.panel} aria-labelledby="competitions-title" aria-busy={list.loading}>
        <div className={styles.panelHeader}>
          <div><h2 id="competitions-title">{title}</h2><p className={styles.muted}>{list.data ? `${list.data.total} ${list.data.total === 1 ? "competition" : "competitions"}` : "Competitions for your assigned gyms"}</p></div>
          <div className={styles.filters}>
            <label>Period<select value={period} onChange={event => { updateFilters({ period: event.target.value as CompetitionPeriod, page: 1 }); }}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All competitions</option></select></label>
            <label>Gym<select value={gymId} onChange={event => { updateFilters({ gymId: event.target.value, page: 1 }); }}><option value="">All assigned gyms</option>{summary.data?.gyms.map(gym => <option key={gym._id} value={gym._id}>{gym.name}</option>)}</select></label>
          </div>
        </div>
        {list.loading && <p role="status" className={styles.muted}>Loading competitions…</p>}
        {!!list.error && <div role="alert" className={styles.alert}><p>{problem(list.error, "Couldn't load competitions. Please try again.")}</p><button type="button" className={styles.secondary} onClick={refresh}>Retry competitions</button></div>}
        {list.data && (list.data.competitions.length ? <>
          <ul className={styles.events}>{list.data.competitions.map(competition => <CompetitionRow key={competition._id} competition={competition} search={location.search} />)}</ul>
          <nav className={styles.pagination} aria-label="Competition pages"><button type="button" className={styles.secondary} disabled={page <= 1} onClick={() => updateFilters({ page: page - 1 })}>Previous</button><span>Page {list.data.page} of {Math.max(1, Math.ceil(list.data.total / list.data.limit))}</span><button type="button" className={styles.secondary} disabled={list.data.page * list.data.limit >= list.data.total} onClick={() => updateFilters({ page: page + 1 })}>Next</button></nav>
        </> : <p className={styles.empty}>No {period === "all" ? "" : `${period} `}competitions for the selected gyms.</p>)}
      </section>}
    </>}
  </AppLayout>;
}

function CompetitionRow({ competition, search }: { competition: ManagedCompetition; search: string }) {
  return <li className={styles.event}>
    <div className={styles.eventDate}><time dateTime={competition.date}>{formatCalendarDate(competition.date)}</time><span className={styles.badge} data-status={competition.status}>{statusLabels[competition.status]}</span></div>
    <div className={styles.eventInfo}>
      <h3>{competition.name}</h3>
      <p>{competition.gym?.name ?? "Gym unavailable"}, {competition.location}</p>
      <p>Registration {competition.registrationStatus === "OPEN" ? "open" : "closed"}, capacity {competition.capacity}</p>
    </div>
    <Link className={styles.manage} to={`${competitionPath(competition._id)}${search}`} aria-label={`View details for ${competition.name}`}>View details</Link>
  </li>;
}
