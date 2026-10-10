import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import logoUrl from "../../assets/brand/topsend-logo.png";
import { ApiError } from "../../lib/apiClient.ts";
import {
  fetchGymAdminDashboard, getManagedCompetition, listManagedCompetitions,
  type CompetitionPeriod, type ManagedCompetition,
} from "../../lib/gymAdminApi.ts";
import { useSession } from "../session/sessionContext.ts";
import styles from "./GymAdminDashboard.module.css";

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
  return state.read === read && state.revision === revision ? state : { data: null, error: null, loading: !!read };
}

const dateFormat = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function calendarDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : dateFormat.format(date);
}
function problem(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
function competitionPath(id: string) {
  return `/gym-admin/competitions/${encodeURIComponent(id)}`;
}
const statusLabels = { DRAFT: "Draft", PUBLISHED: "Published", CANCELLED: "Cancelled" };

/** US-011 #42/#43. RequireSession handles login; the server checks role and gym assignment. */
export default function GymAdminDashboard() {
  const { user } = useSession();
  if (user?.role !== "GYM_ADMIN") return <main className={styles.denied}>
    <h1>Gym administrator access required</h1><Link to="/dashboard">Back to dashboard</Link>
  </main>;
  return <GymWorkspace key={user.userId} />;
}

function GymWorkspace() {
  const { user, logOut } = useSession();
  const { competitionId } = useParams();
  const location = useLocation();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const periodValue = search.get("period");
  const period: CompetitionPeriod = periodValue === "past" || periodValue === "all" ? periodValue : "upcoming";
  const gymId = search.get("gymId") ?? "";
  const requestedPage = Number(search.get("page") ?? "1");
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
    if (!location.hash) document.getElementById("gym-dashboard-main")?.scrollIntoView?.({ block: "start" });
  }, [location.pathname, location.hash]);
  const [revision, setRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
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
  async function onLogOut() {
    if (loggingOut) return;
    setLoggingOut(true); setLogoutError("");
    try { await logOut(); }
    catch (error) { setLogoutError(problem(error, "Couldn't log out. Please try again.")); setLoggingOut(false); }
  }
  function refresh() { setRevision(value => value + 1); }
  return <div className={styles.workspace}>
    <title>{competitionId ? "Competition Details | TopSend" : "Gym Admin Dashboard | TopSend"}</title>
    <a className={styles.skip} href="#gym-dashboard-main">Skip to dashboard</a>
    <aside className={styles.sidebar}>
      <Link to={dashboardPath} aria-label="TopSend dashboard"><img src={logoUrl} alt="TopSend" width="159" height="52" /></Link>
      <p className={styles.eyebrow}>Gym administration</p>
      <nav aria-label="Gym dashboard"><Link to={dashboardPath} aria-current={!competitionId && location.hash !== "#competitions" ? "page" : undefined}>Overview</Link><Link to={`${dashboardPath}#competitions`} aria-current={!competitionId && location.hash === "#competitions" ? "location" : undefined}>Competitions</Link>{competitionId && <a href="#selected-competition" aria-current="page">Competition details</a>}</nav>
      <div className={styles.account}><p>{user?.email}</p><button onClick={onLogOut} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</button>{logoutError && <p role="alert">{logoutError}</p>}</div>
    </aside>
    <main id="gym-dashboard-main" className={styles.main}>
      <header className={styles.heading}><div><p className={styles.eyebrow}>Your competitions</p><h1>{competitionId ? selected.data?.name ?? "Competition details" : "Gym admin dashboard"}</h1><p>{competitionId ? "View the selected competition and its available tools." : "Plan your next event and keep your competitions in view."}</p></div>
        <button onClick={refresh} disabled={loading}>{competitionId ? "Refresh details" : "Refresh dashboard"}</button>
      </header>
      {forbidden ? <section className={styles.panel} role="alert"><h2>Dashboard unavailable</h2><p>{problem(forbidden, "Your gym access is unavailable.")}</p><button onClick={refresh} disabled={loading}>Try again</button></section> : <>
        {!competitionId && <section aria-label="Competition overview" aria-busy={summary.loading}>
          {summary.loading && <p role="status">Loading gym overview…</p>}
          {!!summary.error && <div role="alert"><p>{problem(summary.error, "Couldn't load your gym overview. Please try again.")}</p><button onClick={refresh}>Retry overview</button></div>}
          <div className={styles.counts}>{([['Upcoming', summary.data?.counts.upcoming], ['Past', summary.data?.counts.past], ['Upcoming drafts', summary.data?.counts.drafts]] as const).map(([label, value]) => <div className={styles.count} key={label}><h2>{label}</h2><p>{value === undefined ? "—" : value.toLocaleString("en-CA")}</p></div>)}</div>
          {summary.data && <div className={styles.gymOverview}><div><h2>Your gyms</h2><ul>{summary.data.gyms.map(gym => <li key={gym._id}><strong>{gym.name}</strong><span>{gym.location}</span></li>)}</ul></div>
            {next && <div><h2>Next competition</h2><Link to={`${competitionPath(next._id)}${location.search}`}>{next.name}</Link><p>{calendarDate(next.date)} · {next.gym?.name}</p></div>}
          </div>}
        </section>}
        {competitionId && <section id="selected-competition" className={styles.panel} aria-label="Selected competition" aria-busy={selected.loading}>
          <div className={styles.heading}><h2 id="competition-information">Competition information</h2><Link to={dashboardPath}>Back to overview</Link></div>
          {selected.loading && <p role="status">Loading selected competition…</p>}
          {!!selected.error && <div role="alert"><p>{problem(selected.error, "Couldn't load this competition. Please try again.")}</p><button onClick={refresh}>Retry competition</button></div>}
          {selected.data && <>
            <dl className={styles.details}><div><dt>Gym</dt><dd>{selected.data.gym?.name ?? "Gym unavailable"}</dd></div><div><dt>Date</dt><dd><time dateTime={selected.data.date}>{calendarDate(selected.data.date)}</time></dd></div><div><dt>Location</dt><dd>{selected.data.location}</dd></div><div><dt>Status</dt><dd>{statusLabels[selected.data.status]}</dd></div><div><dt>Registration</dt><dd>{selected.data.registrationStatus === "OPEN" ? "Open" : "Closed"}</dd></div><div><dt>Participant capacity</dt><dd>{selected.data.capacity}</dd></div></dl>
            {selected.data.description && <p className={styles.description}>{selected.data.description}</p>}
            <h3>Management tools</h3><div className={styles.tools}>{selected.data.tools.filter(tool => tool.key !== "details").map(tool => <span className={styles.unavailable} key={tool.key} aria-disabled="true">{tool.label}<small>Not available yet</small></span>)}</div>
          </>}
        </section>}
        {!competitionId && <section id="competitions" className={styles.panel} aria-labelledby="competitions-title" aria-busy={list.loading}>
          <div className={styles.heading}><div><h2 id="competitions-title">{title}</h2><p>{list.data ? `${list.data.total} ${list.data.total === 1 ? "competition" : "competitions"}` : "Competitions for your assigned gyms"}</p></div>
            <div className={styles.filters}><label>Period<select value={period} onChange={event => { updateFilters({ period: event.target.value as CompetitionPeriod, page: 1 }); }}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All competitions</option></select></label>
              <label>Gym<select value={gymId} onChange={event => { updateFilters({ gymId: event.target.value, page: 1 }); }}><option value="">All assigned gyms</option>{summary.data?.gyms.map(gym => <option key={gym._id} value={gym._id}>{gym.name}</option>)}</select></label>
            </div>
          </div>
          {list.loading && <p role="status">Loading competitions…</p>}
          {!!list.error && <div role="alert"><p>{problem(list.error, "Couldn't load competitions. Please try again.")}</p><button onClick={refresh}>Retry competitions</button></div>}
          {list.data && (list.data.competitions.length ? <>
            <ul className={styles.events}>{list.data.competitions.map(competition => <CompetitionRow key={competition._id} competition={competition} search={location.search} />)}</ul>
            <nav className={styles.pagination} aria-label="Competition pages"><button disabled={page <= 1} onClick={() => updateFilters({ page: page - 1 })}>Previous</button><span>Page {list.data.page} of {Math.max(1, Math.ceil(list.data.total / list.data.limit))}</span><button disabled={list.data.page * list.data.limit >= list.data.total} onClick={() => updateFilters({ page: page + 1 })}>Next</button></nav>
          </> : <p className={styles.empty}>No {period === "all" ? "" : `${period} `}competitions for the selected gyms.</p>)}
        </section>}
      </>}
    </main>
  </div>;
}

function CompetitionRow({ competition, search }: { competition: ManagedCompetition; search: string }) {
  return <li className={styles.event}>
    <div className={styles.eventDate}><time dateTime={competition.date}>{calendarDate(competition.date)}</time><span className={`${styles.badge} ${styles[competition.status.toLowerCase()]}`}>{statusLabels[competition.status]}</span></div>
    <div className={styles.eventInfo}><h3>{competition.name}</h3><p>{competition.gym?.name ?? "Gym unavailable"} · {competition.location}</p><p>Registration {competition.registrationStatus === "OPEN" ? "open" : "closed"} · Capacity {competition.capacity}</p></div>
    <Link className={styles.manage} to={`${competitionPath(competition._id)}${search}`} aria-label={`View details for ${competition.name}`}>View details →</Link>
  </li>;
}
