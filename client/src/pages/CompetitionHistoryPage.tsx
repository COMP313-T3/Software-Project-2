import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useLiveReload } from "../components/common/useLiveReload.ts";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { PAGE_TOPIC } from "../lib/liveChanges.ts";
import {
  checkedHistory, checkedHistoryDetail, historyProblem,
  type HistoryCollection, type HistoryDetail, type HistoryGateway, type HistoricalRoute,
} from "../lib/competitionHistory.ts";
import { historyGateway } from "../lib/competitionHistoryApi.ts";
import { statisticsProblem, type RouteStatistics } from "../lib/routeStatisticsApi.ts";
import styles from "./CompetitionHistoryPage.module.css";

const base = "/gym-admin/history";
type ReadState<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };
/** Whether a failed read means the Gym Admin may no longer see what the page shows. */
const lostAccess = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
/** What the list of previous competitions shows, and what one competition's saved results add to it. */
const LIST_TOPICS = [PAGE_TOPIC.competitions, PAGE_TOPIC.gyms], RESULT_TOPICS = [...LIST_TOPICS, PAGE_TOPIC.results];

/** The page follows the history by itself, keeping what it shows until the new history arrives. */
export default function CompetitionHistoryPage({ gateway = historyGateway }: { gateway?: HistoryGateway }) {
  const { user } = useSession();
  const { competitionId } = useParams();
  const [params] = useSearchParams();
  if (user?.role !== "GYM_ADMIN") return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  return <Workspace key={`${user.userId}:${competitionId?.toLowerCase() ?? "list"}:${competitionId ? positivePage(params.get("resultsPage")) : 1}`} gateway={gateway} competitionId={competitionId?.toLowerCase()} />;
}
function Workspace({ gateway, competitionId }: { gateway: HistoryGateway; competitionId?: string }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ReadState<{ scope: HistoryCollection; detail: HistoryDetail | null }>>({ status: "loading" });
  const [params] = useSearchParams();
  const returning = new URLSearchParams(params); returning.delete("routeId"); returning.delete("resultsPage");
  const suffix = returning.size ? `?${returning}` : "";
  const resultsPage = positivePage(params.get("resultsPage"));
  const dashboardGym = params.get("gymId");
  const dashboardSearch = dashboardGym && state.status === "ready" && state.data.scope.gyms.some(gym => gym.gymId === dashboardGym)
    ? `?${new URLSearchParams({ gymId: dashboardGym })}` : "";
  const invalid = competitionId !== undefined && !/^[a-f\d]{24}$/i.test(competitionId);
  useEffect(() => {
    const controller = new AbortController();
    if (invalid) return () => controller.abort();
    async function load() {
      try {
        const scope = checkedHistory(await gateway.list(controller.signal));
        if (controller.signal.aborted) return;
        let detail: HistoryDetail | null = null;
        if (competitionId) {
          const expected = scope.competitions.find(event => event.competitionId === competitionId);
          if (!expected) throw new ApiError(404, "HISTORY_NOT_FOUND", "History unavailable");
          detail = checkedHistoryDetail(await (resultsPage === 1 ? gateway.get(competitionId, controller.signal) : gateway.get(competitionId, controller.signal, resultsPage)), expected);
        }
        if (!controller.signal.aborted) setState({ status: "ready", data: { scope, detail } });
      } catch (error) {
        if (controller.signal.aborted) return;
        // A failed reread keeps the history it has, unless the Gym Admin may no longer see it.
        setState(now => now.status === "ready" && !lostAccess(error) ? now : { status: "error", error });
      }
    }
    void load();
    return () => controller.abort();
  }, [gateway, competitionId, revision, invalid, resultsPage]);
  function refresh() { setState({ status: "loading" }); setRevision(value => value + 1); }
  useLiveReload(() => setRevision(value => value + 1), { topics: competitionId ? RESULT_TOPICS : LIST_TOPICS, competitionId, paused: invalid || state.status === "loading" });
  return <AppLayout title={competitionId ? "Historical results" : "Competition history"}>
    <title>{`${competitionId ? "Historical results" : "Competition history"} | TopSend`}</title>
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <Link to={competitionId ? base + suffix : "/dashboard" + dashboardSearch}>Back to {competitionId ? "competition history" : "dashboard"}</Link>
      </div>
      {invalid ? <Notice title="Invalid competition link">Open a previous competition from your competition history.</Notice> :
        state.status === "loading" ? <p role="status">Loading competition history…</p> :
        state.status === "error" ? <div className={styles.error} role="alert"><p>{historyProblem(state.error)}</p><button type="button" onClick={refresh}>Try again</button></div> :
        state.data.detail ? <HistoricalResults detail={state.data.detail} gateway={gateway} revision={revision} gymName={state.data.scope.gyms.find(gym => gym.gymId === state.data.detail!.competition.gymId)!.name} /> :
        <HistoryList scope={state.data.scope} />}
    </div>
  </AppLayout>;
}
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.panel} role="status"><h2>{title}</h2><p className={styles.muted}>{children}</p></section>;
}
function HistoryList({ scope }: { scope: HistoryCollection }) {
  const [params, setParams] = useSearchParams();
  const gymId = params.get("gymId") ?? "";
  const invalidGym = gymId !== "" && !scope.gyms.some(gym => gym.gymId === gymId);
  const events = scope.competitions.filter(event => !gymId || event.gymId === gymId);
  const page = positivePage(params.get("page")), limit = 10;
  const visible = events.slice((page - 1) * limit, page * limit);
  function move(page: number) { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); }
  return <>
    <header className={styles.intro}><h2>Previous competitions</h2><p className={styles.muted}>Review saved results and route performance from past events at your gyms.</p></header>
    {scope.gyms.length > 1 || invalidGym ? <div className={styles.filter}><label htmlFor="history-gym">Gym</label><select id="history-gym" value={gymId} onChange={event => {
      const next = new URLSearchParams(params); next.delete("page"); next.delete("routeId");
      if (event.target.value) next.set("gymId", event.target.value); else next.delete("gymId"); setParams(next, { replace: true });
    }}><option value="">All assigned gyms</option>{invalidGym && <option value={gymId} disabled>Gym unavailable</option>}{scope.gyms.map(gym => <option key={gym.gymId} value={gym.gymId}>{gym.name}</option>)}</select></div> : null}
    {invalidGym ? <Notice title="Gym unavailable">Choose one of your assigned gyms to view its competition history.</Notice> : !events.length ? <Notice title="No previous competitions">Past competitions from your assigned gyms will appear here.</Notice> : <>
      <p className={styles.muted}>{events.length} past {events.length === 1 ? "competition" : "competitions"}</p>
      {!visible.length && <Notice title="No competitions on this page"><button type="button" onClick={() => move(1)}>Go to first page</button></Notice>}
      <ul className={styles.events} aria-label="Previous competitions">{visible.map(event => {
        const next = new URLSearchParams(params); next.delete("routeId"); const suffix = next.size ? `?${next}` : "";
        return <li key={event.competitionId} className={styles.panel}><div><p className={styles.date}>{formatCalendarDate(event.date)} <Status value={event.status} /></p><h3>{event.name}</h3><p className={styles.muted}>{scope.gyms.find(gym => gym.gymId === event.gymId)!.name} · {event.location}</p></div><Link className={styles.view} to={`${base}/${encodeURIComponent(event.competitionId)}${suffix}`} aria-label={`View history for ${event.name}`}>View results <span aria-hidden="true">→</span></Link></li>;
      })}</ul>
      <Pager page={page} limit={limit} total={events.length} move={move} label="Historical competition pages" />
    </>}
  </>;
}
function HistoricalResults({ detail, gymName, gateway, revision }: { detail: HistoryDetail; gymName: string; gateway: HistoryGateway; revision: number }) {
  const { competition, results, routes } = detail;
  const [params, setParams] = useSearchParams();
  function move(page: number) { const next = new URLSearchParams(params); next.set("resultsPage", String(page)); setParams(next); }
  return <>
    <header className={`${styles.panel} ${styles.context}`}><p className={styles.eyebrow}>Previous competition <Status value={competition.status} /></p><h2>{competition.name}</h2><p className={styles.muted}>{formatCalendarDate(competition.date)} · {gymName} · {competition.location}</p><p>Saved results and route statistics · Read only</p></header>
    <section aria-labelledby="history-results-heading"><h2 id="history-results-heading" className={styles.sectionTitle}>Saved results</h2>
      {results && results.length > 0 && detail.resultsPage && <p className={styles.resultRange}>Showing {(detail.resultsPage.page - 1) * detail.resultsPage.limit + 1}–{(detail.resultsPage.page - 1) * detail.resultsPage.limit + results.length} of {detail.resultsPage.total} official result records</p>}
      {results === null ? <Notice title="Results unavailable">No saved result information is available for this competition.</Notice> : !results.length ? detail.resultsPage && detail.resultsPage.page > 1 ? <Notice title="No results on this page"><button type="button" onClick={() => move(1)}>Go to first results page</button></Notice> : <Notice title="No saved results">This competition has no saved official result records.</Notice> : <div className={styles.tableWrap} role="region" aria-label="Saved official results" tabIndex={0}><table><caption>Official result records for {competition.name}</caption><thead><tr><th scope="col">Climber</th><th scope="col">Boulder problem</th><th scope="col">Attempts</th><th scope="col">Sent</th><th scope="col">Flash</th><th scope="col">Score</th></tr></thead><tbody>{results.map(result => {
        const route = routes?.find(route => route.routeId === result.routeId);
        return <tr key={result.resultId}><th scope="row">{result.climberName}{result.divisionName && <small>{result.divisionName}</small>}</th><td>{route ? routeName(route) : "Route information unavailable"}</td><td>{result.attempts}</td><td>{result.sends ? "Yes" : "No"}</td><td>{result.flash ? "Yes" : "No"}</td><td>{result.officialScore}</td></tr>;
      })}</tbody></table></div>}
      {detail.resultsPage && <Pager {...detail.resultsPage} move={move} label="Historical result pages" />}
    </section>
    <section aria-labelledby="history-statistics-heading"><h2 id="history-statistics-heading" className={styles.sectionTitle}>Route statistics</h2>
      {routes === null ? <Notice title="Route information unavailable">Historical route information and statistics are not available.</Notice> : !routes.length ? <Notice title="No saved boulder problems">No historical route records are available for this competition.</Notice> : <HistoricalStatistics routes={routes} gateway={gateway} competitionId={competition.competitionId} revision={revision} />}
    </section>
  </>;
}
function routeName(route: HistoricalRoute) { return `Route ${route.routeNumber}${route.name ? ` · ${route.name}` : ""}`; }
function HistoricalStatistics({ routes, gateway, competitionId, revision }: { routes: HistoricalRoute[]; gateway: HistoryGateway; competitionId: string; revision: number }) {
  const [params, setParams] = useSearchParams();
  const routeId = params.get("routeId") ?? routes[0].routeId;
  const route = routes.find(route => route.routeId === routeId);
  return <div className={styles.panel}>
    <label htmlFor="history-route">Boulder problem</label><select id="history-route" value={routeId} onChange={event => { const next = new URLSearchParams(params); next.set("routeId", event.target.value); setParams(next, { replace: true }); }}>
      {!route && <option value={routeId} disabled>Route unavailable</option>}{routes.map(route => <option key={route.routeId} value={route.routeId}>{routeName(route)} · {route.grade}</option>)}
    </select>
    {!route ? <p role="status">Choose an available route to view its statistics.</p> : <>
      <p className={styles.muted}>Official grade: <strong>{route.grade}</strong></p>
      <StatisticsValues key={route.routeId} route={route} competitionId={competitionId} read={gateway.statistics} revision={revision} />
    </>}
    <p className={styles.note}>Rates use the available official result records for this route. Flash rate counts first-attempt sends; average attempts includes unsuccessful records. Missing data is not treated as zero. Statistics do not change official grades.</p>
  </div>;
}
function StatisticsValues({ route, competitionId, read, revision }: {
  route: HistoricalRoute; competitionId: string; read?: HistoryGateway["statistics"];
  /** Changes when the page reads its data again, so the statistics are read again with it. */
  revision: number;
}) {
  const [state, setState] = useState<ReadState<RouteStatistics | null>>({ status: "loading" });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!read) return;
    const controller = new AbortController();
    read(competitionId, route.routeId, controller.signal).then(data => {
      if (data && data.routeId !== route.routeId) throw new Error("Wrong historical route statistics.");
      if (!controller.signal.aborted) setState({ status: "ready", data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      // A failed reread keeps the statistics it has, unless the Gym Admin may no longer see them.
      setState(now => now.status === "ready" && !lostAccess(error) ? now : { status: "error", error });
    });
    return () => controller.abort();
  }, [competitionId, route.routeId, read, revision, tries]);
  const percent = (value: number) => `${(value * 100).toLocaleString("en-CA", { maximumFractionDigits: 1 })}%`;
  // Without a reader of its own, the statistics are the ones saved with the route.
  const shown: ReadState<RouteStatistics | null> = read ? state : { status: "ready", data: route.statistics };
  if (shown.status === "loading") return <p role="status">Loading route statistics…</p>;
  if (shown.status === "error") return <div role="alert" className={styles.error}><p>{statisticsProblem(shown.error)}</p><button type="button" onClick={() => { setState({ status: "loading" }); setTries(value => value + 1); }}>Retry statistics</button></div>;
  const stats = shown.data;
  return stats === null ? <p role="status">No official result data is available for this route. This does not mean a 0% completion rate.</p> : <>
    <dl className={styles.metrics}><div><dt>Completion rate</dt><dd>{percent(stats.completionRate)}</dd></div><div><dt>Average attempts</dt><dd>{stats.averageAttempts.toLocaleString("en-CA", { maximumFractionDigits: 2 })}</dd></div><div><dt>Flash rate</dt><dd>{percent(stats.flashRate)}</dd></div></dl>
    <p className={styles.muted}>Calculated {formatTorontoDateTime(stats.calculatedAt)}</p>
  </>;
}
function positivePage(value: string | null) { const page = Number(value ?? 1); return Number.isSafeInteger(page) && page > 0 ? page : 1; }
function Status({ value }: { value?: HistoricalCompetitionStatus }) { return value ? <span className={styles.badge}>{value === "PUBLISHED" ? "Published" : value === "CANCELLED" ? "Cancelled" : "Draft"}</span> : null; }
type HistoricalCompetitionStatus = "PUBLISHED" | "DRAFT" | "CANCELLED";
function Pager({ page, limit, total, move, label }: { page: number; limit: number; total: number; move: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages === 1 && page === 1) return null;
  return <nav aria-label={label} className={styles.pager}><button type="button" disabled={page <= 1} onClick={() => move(page - 1)}>Previous</button><span>{page <= pages ? `Page ${page} of ${pages}` : `Page ${page} unavailable`}</span><button type="button" disabled={page >= pages} onClick={() => move(page + 1)}>Next</button></nav>;
}
