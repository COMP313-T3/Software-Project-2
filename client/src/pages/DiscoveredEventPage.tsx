import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import EventDetailsContent from "../components/discovery/EventDetailsContent.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { discoveryProblem, getDiscoveredEvent, type DiscoveredEventDetails } from "../lib/discoveryApi.ts";
import { prepareEventRegistration } from "../lib/eventRegistration.ts";
import { registerForEvent } from "../lib/eventRegistrationApi.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";

export default function DiscoveredEventPage() {
  const { user } = useSession(); const { competitionId = "" } = useParams();
  if (user?.role !== "CLIMBER") return <AccessRequired title="Climber access required" allowed="Climbers" />;
  return <EventWorkspace key={user.userId + ":" + competitionId} id={competitionId} climberId={user.userId} />;
}
function EventWorkspace({ id, climberId }: { id: string; climberId: string }) {
  const { search } = useLocation(); const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ revision: number; data: DiscoveredEventDetails | null; error: unknown }>({ revision: -1, data: null, error: null });
  const loading = state.revision !== revision;
  useEffect(() => {
    const controller = new AbortController();
    getDiscoveredEvent(id, controller.signal).then(data => { if (!controller.signal.aborted) setState({ revision, data, error: null }); }).catch(error => { if (!controller.signal.aborted) setState({ revision, data: null, error }); });
    return () => controller.abort();
  }, [id, revision]);
  const event = !loading ? state.data : null;
  return <AppLayout title={event?.name ?? "Event details"}><title>{event ? `${event.name} | TopSend` : "Event Details | TopSend"}</title>
    <div className={workspace.intro}><Link className={workspace.back} to={`/competitions${search}`}>Back to discovery</Link><button className={workspace.secondary} disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Refresh event details</button></div>
    {loading ? <p className={workspace.panel} role="status">Loading event details…</p> : state.error ? <section className={workspace.panel} role="alert"><h2>Event unavailable</h2><p>{discoveryProblem(state.error, "Couldn't load this event. Please try again.")}</p><button className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></section>
      : event && <EventDetailsContent event={event} setup={prepareEventRegistration(event)} climberId={climberId} register={registerForEvent} onBusy={setSaving}
        onDenied={error => setState({ revision, data: null, error })} />}
  </AppLayout>;
}
