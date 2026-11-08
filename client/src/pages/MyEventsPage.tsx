import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { getMyEvents, myEventsProblem, type MyEvent } from "../lib/myEventsApi.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import LeaderboardPage from "./LeaderboardPage.tsx";
import RegistrationStatusPage from "./RegistrationStatusPage.tsx";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./MyEventsPage.module.css";

const STATUS = { CONFIRMED: "Confirmed", WAITLIST: "Waitlist", PENDING: "Pending" };
const EVENT_STATUS = { PUBLISHED: "Published", DRAFT: "Draft", CANCELLED: "Cancelled" };
const SIZE = 10;
/** US030 #201/#202: only the current Climber's server-returned registrations enter this workspace. */
export default function MyEventsPage({ tool }: { tool?: "leaderboard" | "registration" }) {
  const { user } = useSession(), { competitionId = "" } = useParams();
  if (user?.role !== "CLIMBER") return <AccessRequired title="Climber access required" allowed="Climbers" />;
  return <EventsWorkspace key={JSON.stringify([user.userId, competitionId, tool])} id={competitionId} tool={tool} />;
}
function EventsWorkspace({ id, tool }: { id: string; tool?: "leaderboard" | "registration" }) {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; events: MyEvent[] | null; error: unknown }>({ revision: -1, events: null, error: null });
  const loading = read.revision !== revision;
  useEffect(() => {
    const controller = new AbortController();
    getMyEvents(controller.signal).then(events => {
      if (!controller.signal.aborted) setRead({ revision, events, error: null });
    }).catch(error => { if (!controller.signal.aborted) setRead({ revision, events: null, error }); });
    return () => controller.abort();
  }, [revision]);
  const events = loading ? [] : read.events ?? [];
  const selected = events.find(event => event.competition._id.toLowerCase() === id.toLowerCase());
  const pageCount = Math.max(1, Math.ceil(events.length / SIZE));
  const requested = Number(params.get("page") ?? 1);
  // A pending/failed read has no list length yet; keep its return context until a real list arrives.
  const paginationReady = !loading && read.events !== null;
  const page = Number.isSafeInteger(requested) && requested > 0 ? paginationReady ? Math.min(requested, pageCount) : requested : 1;
  const search = page > 1 ? `?page=${page}` : "";
  const path = selected ? `/my-events/${encodeURIComponent(selected.competition._id)}` : "";
  if (tool === "leaderboard" && selected && selected.competition.status !== "DRAFT" && !read.error) return <LeaderboardPage audience="climber" returnTo={path + search} />;
  if (tool === "registration" && selected && !read.error) return <RegistrationStatusPage returnTo={path + search} />;
  return <AppLayout title={id ? "My event" : "My Events"}><div className={styles.content}>
    <title>{selected ? `${selected.competition.name} | My Events | TopSend` : "My Events | TopSend"}</title>
    <div className={styles.heading}>
      {id ? <Link className={workspace.back} to={`/my-events${search}`}>Back to My Events</Link> : <p>Your registered competitions and event tools, all in one place.</p>}
      <button className={workspace.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh events</button>
    </div>
    {loading ? <p className={workspace.panel} role="status">Loading your events…</p>
      : read.error ? <section className={workspace.panel} role="alert"><h2>My Events unavailable</h2><p>{myEventsProblem(read.error)}</p>
        {read.error instanceof ApiError && read.error.status === 401 && <Link className={workspace.secondary} to="/login">Sign in</Link>}</section>
      : id ? selected ? <>
        <section className={workspace.panel}><h2>{selected.competition.name}</h2><div className={styles.badges}><span className={styles.badge}>{STATUS[selected.registration.status]}</span><span className={styles.badge}>{EVENT_STATUS[selected.competition.status]}</span></div>
          <dl className={styles.details}>{[
            ["Date", formatCalendarDate(selected.competition.date)], ["Location", selected.competition.location || "Location unavailable"],
            ["Gym", selected.competition.gym?.name ?? "Gym unavailable"], ["Division", selected.registration.division?.name ?? "Division unavailable"],
            ["Registered (Toronto time)", formatTorontoDateTime(selected.registration.registeredAt)],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {selected.competition.status === "CANCELLED" ? <p role="status">This competition has been cancelled. Your saved registration is shown for reference.</p>
            : selected.registration.status !== "CONFIRMED" && <p role="status">Your place is not confirmed. Check your registration status for updates.</p>}
        </section>
        <section className={`${workspace.panel} ${styles.tools}`} aria-labelledby="event-tools"><h2 id="event-tools">Event tools</h2>
          <div className={styles.actions}><Link className={workspace.secondary} to={`${path}/registration${search}`}>Registration status</Link>
            {selected.competition.status !== "DRAFT" && <Link className={workspace.primary} to={`${path}/leaderboard${search}`}>Live leaderboard</Link>}</div>
          {selected.competition.status === "DRAFT" && <p>The leaderboard is unavailable while this event is a draft.</p>}
        </section>
      </> : <section className={workspace.panel} role="alert"><h2>Event unavailable</h2><p>This event is not in your registered competitions. Refresh your events or choose another event.</p></section>
      : !events.length ? <section className={workspace.panel}><h2>No registered events yet</h2><p>Once you register for a competition, it will appear here.</p><Link className={workspace.primary} to="/competitions">Discover competitions</Link></section>
      : <section className={workspace.panel} aria-labelledby="registered-events"><h2 id="registered-events">Registered competitions</h2><p className={styles.muted}>{events.length} {events.length === 1 ? "event" : "events"}</p>
        <ul className={styles.list}>{events.slice((page - 1) * SIZE, page * SIZE).map(({ competition: event, registration }) => <li className={styles.row} key={event._id}>
          <div className={styles.event}><h3>{event.name}</h3><p><time dateTime={event.date}>{formatCalendarDate(event.date)}</time> · {event.location || "Location unavailable"}</p><p className={styles.muted}>{event.gym?.name ?? "Gym unavailable"} · {registration.division?.name ?? "Division unavailable"}</p><div className={styles.badges}><span className={styles.badge}>{STATUS[registration.status]}</span><span className={styles.badge}>{EVENT_STATUS[event.status]}</span></div></div>
          <Link className={workspace.secondary} aria-label={`Open ${event.name}`} to={`/my-events/${encodeURIComponent(event._id)}${search}`}>Open event →</Link>
        </li>)}</ul>
        {pageCount > 1 && <nav className={styles.pagination} aria-label="My Events pages"><button className={workspace.secondary} disabled={page === 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button><span>Page {page} of {pageCount}</span><button className={workspace.secondary} disabled={page === pageCount} onClick={() => setParams({ page: String(page + 1) })}>Next</button></nav>}
      </section>}
  </div></AppLayout>;
}
