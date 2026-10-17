import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { formatCalendarDate } from "../lib/dateFormat.ts";
import { discoveryProblem, getDiscoveredEvent, type DiscoveredEventDetails } from "../lib/discoveryApi.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./DiscoverCompetitionsPage.module.css";

export default function DiscoveredEventPage() {
  const { user } = useSession(); const { competitionId = "" } = useParams();
  if (user?.role !== "CLIMBER") return <AccessRequired title="Climber access required" allowed="Climbers" />;
  return <EventWorkspace key={user.userId + ":" + competitionId} id={competitionId} />;
}
function EventWorkspace({ id }: { id: string }) {
  const { search } = useLocation(); const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ revision: number; data: DiscoveredEventDetails | null; error: unknown }>({ revision: -1, data: null, error: null });
  const loading = state.revision !== revision;
  useEffect(() => {
    const controller = new AbortController();
    getDiscoveredEvent(id, controller.signal).then(data => { if (!controller.signal.aborted) setState({ revision, data, error: null }); }).catch(error => { if (!controller.signal.aborted) setState({ revision, data: null, error }); });
    return () => controller.abort();
  }, [id, revision]);
  const event = !loading ? state.data : null;
  return <AppLayout title={event?.name ?? "Event details"}><title>{event ? `${event.name} | TopSend` : "Event Details | TopSend"}</title>
    <div className={workspace.intro}><Link className={workspace.back} to={`/competitions${search}`}>Back to discovery</Link><button className={workspace.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh event details</button></div>
    {loading ? <p className={workspace.panel} role="status">Loading event details…</p> : state.error ? <section className={workspace.panel} role="alert"><h2>Event unavailable</h2><p>{discoveryProblem(state.error, "Couldn't load this event. Please try again.")}</p><button className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></section>
      : event && <>
        <section className={workspace.panel} aria-label="Competition event details"><h2>{event.name}</h2><p className={styles.gym}>{event.gym?.name ?? "Gym unavailable"}</p>
          {!event.upcoming && <p className={styles.notice}>This competition has already taken place.</p>}
          <dl className={workspace.details}><div><dt>Date</dt><dd><time dateTime={event.date}>{formatCalendarDate(event.date)}</time></dd></div><div><dt>Location</dt><dd>{event.location}</dd></div><div><dt>Registration</dt><dd>{event.registrationStatus === "OPEN" ? "Open" : "Closed"}</dd></div><div><dt>Capacity</dt><dd>{event.capacity}</dd></div><div><dt>Spaces left</dt><dd>{event.spacesLeft}</dd></div><div><dt>Scoring format</dt><dd>{event.scoringFormat?.label ?? "Not configured"}</dd></div></dl>
          <div className={styles.description}>{event.description || "No event description has been added yet."}</div>
        </section>
        <div className={styles.detailColumns}><section className={workspace.panel} aria-label="Event divisions"><h2>Divisions</h2>{event.divisions.length ? <ul className={styles.divisions}>{event.divisions.map(division => <li key={division._id}>{division.name}</li>)}</ul> : <p>No divisions have been announced yet.</p>}</section>
          <section className={workspace.panel} aria-label="Your event registration"><h2>Your registration</h2>{event.myRegistration ? <><p>{({ CONFIRMED: "Confirmed", PENDING: "Pending", WAITLIST: "Waitlisted" })[event.myRegistration.status]}</p><p>Division: {event.myRegistration.division?.name ?? "Not assigned"}</p></> : <><p>You aren't registered for this competition.</p><p className={styles.help}>This page shows event information. Registration is not available here yet.</p></>}</section></div>
      </>}
  </AppLayout>;
}
