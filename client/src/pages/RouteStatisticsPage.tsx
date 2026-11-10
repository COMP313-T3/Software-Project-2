import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AssistantChat from "../components/assistant/AssistantChat.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { listCompetitionRoutes, type ManagedRoute } from "../lib/routesApi.ts";
import { getRouteStatistics, statisticsProblem, type RouteStatistics } from "../lib/routeStatisticsApi.ts";
import { formatTorontoDateTime } from "../lib/dateFormat.ts";
import common from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./RouteStatisticsPage.module.css";

export default function RouteStatisticsPage() {
  const { user } = useSession(), { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  return <Workspace key={user.userId + competitionId} competitionId={competitionId} />;
}
function Workspace({ competitionId }: { competitionId: string }) {
  const [params, setParams] = useSearchParams(), { search } = useLocation();
  const [data, setData] = useState<{ competition: ManagedCompetitionDetails; routes: ManagedRoute[] } | null>(null);
  const [error, setError] = useState<unknown>(null), [revision, setRevision] = useState(0);
  const [settled, setSettled] = useState(-1);
  const invalid = !/^[a-f\d]{24}$/i.test(competitionId), loading = settled !== revision;
  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    Promise.all([getManagedCompetition(competitionId, controller.signal), listCompetitionRoutes(competitionId, controller.signal)])
      .then(([competition, list]) => { if (!controller.signal.aborted) {
        if (competition._id !== competitionId || list.routes.some(route => route.competitionId !== competitionId)) throw new Error("Competition mismatch");
        setData({ competition, routes: list.routes }); setError(null); setSettled(revision);
      } }).catch(reason => { if (!controller.signal.aborted) { setData(null); setError(reason); setSettled(revision); } });
    return () => controller.abort();
  }, [competitionId, revision, invalid]);
  const routeId = params.get("routeId") ?? data?.routes[0]?.routeId ?? "";
  const selected = data?.routes.find(route => route.routeId === routeId);
  const back = new URLSearchParams(search); back.delete("routeId"); const suffix = back.size ? `?${back}` : "";
  const path = `/gym-admin/competitions/${encodeURIComponent(competitionId)}`;
  return <AppLayout title="Route statistics"><title>Route statistics | TopSend</title><div className={common.page}>
    <div className={styles.toolbar}><Link className={common.back} to={invalid ? `/dashboard${suffix}#competitions` : path + suffix}>{invalid ? "Back to competitions" : "Back to competition"}</Link><button type="button" disabled={loading || invalid} onClick={() => setRevision(v => v + 1)}>Refresh statistics</button></div>
    <p className={styles.help}>Explore boulder problem performance from official results.</p>
    {invalid ? <p role="alert" className={styles.error}>Invalid competition link. Open route statistics from your competition.</p> : loading ? <p role="status">Loading competition routes…</p> : error ? <div className={styles.error} role="alert"><p>{statisticsProblem(error)}</p><button onClick={() => setRevision(v => v + 1)}>Try again</button></div> : data && <>
      <header className={styles.context}><h2>{data.competition.name}</h2><p>{data.competition.gym?.name ?? data.competition.location}</p></header>
      {!data.routes.length ? <section className={common.panel}><h2>No boulder problems yet</h2><p>Add routes to this competition before viewing route statistics.</p><Link to={path + "/routes" + suffix}>View boulder problems</Link></section> : <>
        <section className={`${common.panel} ${styles.selection}`}><div><label htmlFor="statistics-route">Boulder problem</label><select id="statistics-route" value={routeId} onChange={event => { const next = new URLSearchParams(params); next.set("routeId", event.target.value); setParams(next, { replace: true }); }}>
          {!selected && <option value={routeId} disabled>Unavailable route</option>}{data.routes.map(route => <option key={route.routeId} value={route.routeId}>Route {route.routeNumber}{route.name ? ` · ${route.name}` : ""} · {route.grade}</option>)}
        </select></div><p className={styles.help}>{data.routes.length} boulder {data.routes.length === 1 ? "problem" : "problems"} in this competition</p></section>
        {selected ? <Statistics key={selected.routeId + revision} competitionId={competitionId} route={selected} path={path} suffix={suffix} /> : <div role="status" className={common.panel}><h2>Route unavailable</h2><p>Choose an available boulder problem from the list.</p></div>}
      </>}
      <AssistantChat audience="gym-admin" page="route-statistics" competitionId={competitionId} competitionName={data.competition.name} />
    </>}
  </div></AppLayout>;
}
function Statistics({ competitionId, route, path, suffix }: { competitionId: string; route: ManagedRoute; path: string; suffix: string }) {
  const [result, setResult] = useState<RouteStatistics | null>(null), [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0), [settled, setSettled] = useState(-1);
  const loading = settled !== revision;
  useEffect(() => {
    const controller = new AbortController();
    getRouteStatistics(competitionId, route.routeId, controller.signal).then(response => { if (!controller.signal.aborted) { setResult(response.statistics); setError(null); setSettled(revision); } })
      .catch(reason => { if (!controller.signal.aborted) { setResult(null); setError(reason); setSettled(revision); } });
    return () => controller.abort();
  }, [competitionId, route.routeId, revision]);
  return <section aria-labelledby="selected-route-heading" className={styles.statistics}>
    <div className={styles.toolbar}><div><h2 id="selected-route-heading">Route {route.routeNumber}{route.name ? ` · ${route.name}` : ""}</h2><p className={styles.help}>Official grade: <strong>{route.grade}</strong> · <Link to={`${path}/routes/${encodeURIComponent(route.routeId)}${suffix}`}>View route details</Link></p></div></div>
    {loading ? <p role="status">Loading route statistics…</p> : error ? <div role="alert" className={styles.error}><p>{statisticsProblem(error)}</p><button onClick={() => setRevision(v => v + 1)}>Try again</button></div> : result === null ? <div className={common.panel} role="status"><h3>No official result data yet</h3><p>Statistics will appear when official results are recorded for this route. No data does not mean a 0% completion rate.</p></div> : <>
      <div className={styles.metrics}>
        <Rate title="Completion rate" value={result.completionRate} explanation="Successful sends" />
        <article className={common.panel}><h3>Average attempts</h3><p className={styles.value}>{result.averageAttempts.toLocaleString("en-CA", { maximumFractionDigits: 2 })}</p><p className={styles.help}>Attempts per official record, including unsuccessful attempts.</p></article>
        <Rate title="Flash rate" value={result.flashRate} explanation="First-attempt sends" />
      </div><p className={styles.help}>Calculated {formatTorontoDateTime(result.calculatedAt)} · Rates use recorded official results for this route, not all registered Climbers.</p>
    </>}
    <p className={styles.note}>Statistics describe the available results. They do not change the route's official grade. Small or incomplete datasets may not represent the whole competition.</p>
  </section>;
}
function Rate({ title, value, explanation }: { title: string; value: number; explanation: string }) {
  const percentage = (value * 100).toLocaleString("en-CA", { maximumFractionDigits: 1 });
  return <article className={common.panel}><h3>{title}</h3><p className={styles.value}>{percentage}%</p><meter aria-label={title} aria-valuetext={`${percentage}%`} min={0} max={1} value={value}>{percentage}%</meter><p className={styles.help}>{explanation} as a share of this route's official records.</p></article>;
}
