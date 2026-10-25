import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { INVALID_COMPETITION_LINK, isInvalidCompetitionLink } from "../lib/competitionLink.ts";
import { formatCalendarDate } from "../lib/dateFormat.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { listCompetitionRoutes, type ManagedRoute } from "../lib/routesApi.ts";
import styles from "./CompetitionRoutesPage.module.css";

interface RouteListData {
  competition: ManagedCompetitionDetails;
  routes: ManagedRoute[];
}

function readableError(error: unknown) {
  return error instanceof ApiError && error.status > 0 && error.status < 500
    ? error.message : "Couldn't load the boulder problems. Please try again.";
}

function pointsLabel(pointValue: number | undefined) {
  if (pointValue === undefined) return "No point value";
  return `${pointValue} ${pointValue === 1 ? "point" : "points"}`;
}

/** US-016 and US-017: the selected competition's boulder problems, each opening its route details. */
export default function CompetitionRoutesPage() {
  const { user } = useSession();
  const { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  return <RouteList key={user.userId + ":" + competitionId} competitionId={competitionId} />;
}

function RouteList({ competitionId }: { competitionId: string }) {
  const { search } = useLocation();
  const competitionPath = `/gym-admin/competitions/${encodeURIComponent(competitionId)}`;
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; data: RouteListData | null; error: unknown }>({
    revision: -1, data: null, error: null,
  });
  const loading = read.revision !== revision;
  const data = loading ? null : read.data;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const competition = await getManagedCompetition(competitionId, controller.signal);
      if (controller.signal.aborted) return;
      const list = await listCompetitionRoutes(competitionId, controller.signal);
      if (!controller.signal.aborted) setRead({ revision, data: { competition, routes: list.routes }, error: null });
    }
    load().catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ revision, data: null, error });
    });
    return () => controller.abort();
  }, [competitionId, revision]);

  const refresh = () => setRevision(value => value + 1);
  const total = data?.routes.length ?? 0;
  return <AppLayout title="Boulder problems">
    <title>Boulder Problems | TopSend</title>
    <div className={workspace.intro}>
      <div className={workspace.introText}>
        <Link className={workspace.back} to={competitionPath + search}>Back to competition</Link>
        {data && <p className={styles.context}><strong>{data.competition.name}</strong>,{" "}
          <time dateTime={data.competition.date}>{formatCalendarDate(data.competition.date)}</time>
          {data.competition.gym?.name ? ` at ${data.competition.gym.name}` : ""}</p>}
        <p>Open a route to see all of its details or change them.</p>
      </div>
      <div className={workspace.actions}>
        <button type="button" className={workspace.secondary} disabled={loading} onClick={refresh}>Refresh routes</button>
        {data && <Link className={workspace.primary} to={`${competitionPath}/routes/new${search}`}>Add route</Link>}
      </div>
    </div>
    {loading ? <section className={workspace.panel} aria-busy="true"><p role="status" className={workspace.muted}>Loading boulder problems…</p></section>
      : read.error ? <section className={workspace.panel} role="alert">
        <h2>Boulder problems unavailable</h2>
        <p>{isInvalidCompetitionLink(read.error) ? INVALID_COMPETITION_LINK : readableError(read.error)}</p>
        {!isInvalidCompetitionLink(read.error) && <button type="button" className={workspace.secondary} onClick={refresh}>Try again</button>}
      </section>
      : data && <section className={workspace.panel} aria-labelledby="routes-title">
        <h2 id="routes-title">Routes</h2>
        <p className={`${workspace.muted} ${styles.count}`}>{total} {total === 1 ? "route" : "routes"}, by route number</p>
        {total ? <ul className={workspace.events} aria-label="Routes">
          {data.routes.map(route => <li key={route.routeId} className={workspace.event}>
            <div className={styles.number}>
              {route.name && <span>Route {route.routeNumber}</span>}
              <span className={workspace.badge}>{route.grade}</span>
            </div>
            <div className={workspace.eventInfo}>
              <h3>{route.name || `Route ${route.routeNumber}`}</h3>
              <p>{pointsLabel(route.pointValue)}</p>
            </div>
            <Link className={workspace.manage} to={`${competitionPath}/routes/${encodeURIComponent(route.routeId)}${search}`}
              aria-label={`View details for route ${route.routeNumber}${route.name ? `, ${route.name}` : ""}, ${route.grade}`}>View details</Link>
          </li>)}
        </ul> : <p className={workspace.empty}>No routes yet. Add the first boulder problem for this competition.</p>}
      </section>}
  </AppLayout>;
}
