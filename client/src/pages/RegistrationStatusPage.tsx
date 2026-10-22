import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { discoveryProblem } from "../lib/discoveryApi.ts";
import { getRegistrationStatus, type ClimberRegistrationState, type RegistrationStatusData } from "../lib/registrationStatusApi.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./RegistrationStatusPage.module.css";

const STATES: Record<ClimberRegistrationState, { label: string; message: string }> = {
  CONFIRMED: { label: "Confirmed", message: "Your saved registration is confirmed." },
  WAITLIST: { label: "Waitlist", message: "You are on the waitlist for this competition. Your place is not confirmed." },
  PENDING: { label: "Pending", message: "Your registration is pending. Your place has not been confirmed yet." },
  NOT_REGISTERED: { label: "Not registered", message: "No registration was found for your account in this competition." },
  UNAVAILABLE: { label: "Status unavailable", message: "Your registration status could not be confirmed. Refresh to try again." },
};
const displayCount = (value: number | null) => value === null ? "Unavailable" : value.toLocaleString("en-CA");

/** US-029 / #114, #115 -> FR-009 -> AC-013. Read-only, authenticated CLIMBER data. */
export default function RegistrationStatusPage() {
  const { user } = useSession();
  const { competitionId = "" } = useParams();
  if (user?.role !== "CLIMBER") return <AccessRequired title="Climber access required" allowed="Climbers" />;
  return <StatusWorkspace key={user.userId + ":" + competitionId} id={competitionId} />;
}

function StatusWorkspace({ id }: { id: string }) {
  const { search } = useLocation();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; data: RegistrationStatusData | null; error: unknown }>({ revision: -1, data: null, error: null });
  const loading = result.revision !== revision;
  useEffect(() => {
    const controller = new AbortController();
    getRegistrationStatus(id, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ revision, data, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ revision, data: null, error });
    });
    return () => controller.abort();
  }, [id, revision]);
  const data = loading ? null : result.data;
  const loginRequired = result.error instanceof ApiError && result.error.status === 401;
  const refresh = () => setRevision(value => value + 1);
  return <AppLayout title="Registration status">
    <title>{data ? `${data.competition.name} - Registration Status | TopSend` : "Registration Status | TopSend"}</title>
    <div className={workspace.intro}>
      <Link className={workspace.back} to={`/competitions${search}`}>Back to discovery</Link>
      <button className={workspace.secondary} disabled={loading} onClick={refresh}>Refresh status</button>
    </div>
    <div aria-busy={loading}>
      {loading ? <p className={workspace.panel} role="status">Loading your registration status…</p>
        : result.error ? <section className={workspace.panel} role="alert">
          <h2>Registration status unavailable</h2>
          <p>{discoveryProblem(result.error, "Couldn't load your registration status. Please try again.")}</p>
          <div className={workspace.actions}>
            <button className={workspace.secondary} onClick={refresh}>Try again</button>
            {loginRequired && <Link className={workspace.secondary} to="/login">Sign in</Link>}
          </div>
        </section> : data && <StatusDetails data={data} search={search} refreshed={revision > 0} />}
    </div>
  </AppLayout>;
}

function StatusDetails({ data, search, refreshed }: { data: RegistrationStatusData; search: string; refreshed: boolean }) {
  const { competition, state, capacity } = data;
  const status = STATES[state];
  const availability = capacity.full === true ? "Full" : capacity.full === false ? "Spaces remaining" : "Availability unavailable";
  return <>
    <section className={workspace.panel + " " + styles.event} aria-label="Selected competition">
      <p className={styles.eyebrow}>{competition.gymName ?? "Gym unavailable"}</p>
      <h2>{competition.name}</h2>
      <dl className={styles.facts}>
        <div><dt>Competition date</dt><dd>{formatCalendarDate(competition.date)}</dd></div>
        <div><dt>Location</dt><dd>{competition.location ?? "Location unavailable"}</dd></div>
      </dl>
      {competition.status === "CANCELLED" ? <p className={styles.notice}>This competition has been cancelled. Your saved registration is shown below.</p>
        : competition.status === "DRAFT" ? <p className={styles.notice}>This competition is currently a draft. Contact the gym for event information.</p>
          : competition.upcoming === false && <p className={styles.notice}>This competition has already taken place.</p>}
      {competition.registrationStatus === "CLOSED" && <p className={styles.closed}>Registration is closed for this competition.</p>}
    </section>
    <div className={styles.columns}>
      <section className={workspace.panel} aria-label="Your registration">
        <h2>Your registration</h2>
        <div className={styles.state} data-state={state}>
          <p className={styles.caption}>Registration status</p><h3>{status.label}</h3>
        </div>
        <p className={styles.message}>{status.message}</p>
        {state !== "NOT_REGISTERED" && <dl className={styles.registrationFacts}>
          <div><dt>Division</dt><dd>{data.divisionName ?? "Division unavailable"}</dd></div>
          {state === "WAITLIST" && <div><dt>Waitlist position</dt><dd>{displayCount(data.waitlistPosition)}</dd></div>}
          <div><dt>Registered on (Toronto time)</dt><dd>{data.registeredAt ? formatTorontoDateTime(data.registeredAt) : "Unavailable"}</dd></div>
        </dl>}
        {competition.status === "PUBLISHED" && <Link className={workspace.secondary + " " + styles.detailsLink} to={`/competitions/${encodeURIComponent(competition._id)}${search}`}>View event details</Link>}
      </section>
      <section className={workspace.panel} aria-label="Competition capacity">
        <h2>Competition capacity</h2>
        <span className={styles.capacityBadge} data-full={capacity.full === null ? "unknown" : String(capacity.full)}>{availability}</span>
        <p className={styles.capacityMessage}>{capacity.full === true ? "All competition places are currently filled."
          : capacity.full === false ? "The competition has places remaining within its capacity."
            : "Current capacity information is unavailable. Refresh to try again."}</p>
        <dl className={styles.counts}>
          <div><dt>Maximum capacity</dt><dd data-unavailable={capacity.maximum === null}>{displayCount(capacity.maximum)}</dd></div>
          <div><dt>Spaces left</dt><dd data-unavailable={capacity.spacesLeft === null}>{displayCount(capacity.spacesLeft)}</dd></div>
        </dl>
      </section>
    </div>
    {refreshed && <p className={styles.announcement} role="status">Registration status updated: {status.label}. Competition capacity: {availability}.</p>}
  </>;
}
