import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ClimberDivisionControl } from "../components/gym-admin/DivisionControls.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { getClimberDetails, removeClimberRegistration, updateClimberDetails } from "../lib/climberDetailsApi.ts";
import { INVALID_CLIMBER_LINK, INVALID_COMPETITION_LINK, isInvalidCompetitionLink, isInvalidLink } from "../lib/competitionLink.ts";
import { formatCalendarDate, formatTorontoDateTime } from "../lib/dateFormat.ts";
import { listCompetitionDivisions, type CompetitionDivision, type ManagedClimberRegistration } from "../lib/divisionsApi.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import shared from "./CompetitionDivisionsPage.module.css";
import styles from "./ClimberDetailsPage.module.css";

interface ClimberData {
  competition: ManagedCompetitionDetails;
  registration: ManagedClimberRegistration;
  divisions: CompetitionDivision[];
}
const statusLabels = { CONFIRMED: "Confirmed", PENDING: "Pending", WAITLIST: "Waitlisted" };
function readableError(error: unknown, fallback: string) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : fallback;
}

/** US-015 -> FR-005 -> AC-009: details and permitted edits for one event registration. */
export default function ClimberDetailsPage() {
  const { user } = useSession();
  const { competitionId = "", climberId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  return <ClimberWorkspace key={[user.userId, competitionId, climberId].join(":")}
    competitionId={competitionId} climberId={climberId} />;
}

function ClimberWorkspace({ competitionId, climberId }: { competitionId: string; climberId: string }) {
  const { search } = useLocation();
  const listPath = "/gym-admin/competitions/" + encodeURIComponent(competitionId) + "/divisions" + search;
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; data: ClimberData | null; error: unknown }>({
    revision: -1, data: null, error: null,
  });
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState(false);
  const write = useRef<AbortController | null>(null);
  const removedHeading = useRef<HTMLHeadingElement>(null);
  const loading = read.revision !== revision;
  const data = loading || denied ? null : read.data;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const competition = await getManagedCompetition(competitionId, controller.signal);
      if (controller.signal.aborted) return;
      const [registration, catalog] = await Promise.all([
        getClimberDetails(competitionId, climberId, controller.signal),
        listCompetitionDivisions(competitionId, controller.signal),
      ]);
      if (!controller.signal.aborted) setRead({ revision, data: {
        competition, registration,
        divisions: [...catalog.divisions].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })),
      }, error: null });
    }
    load().catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ revision, data: null, error });
    });
    return () => controller.abort();
  }, [competitionId, climberId, revision]);
  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => { if (removed) removedHeading.current?.focus(); }, [removed]);

  async function save<T>(operation: (signal: AbortSignal) => Promise<T>, confirmed: (result: T) => void) {
    if (write.current || !data || denied || removed) return;
    const controller = new AbortController();
    write.current = controller;
    setBusy(true); setNotice("");
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted) return;
      confirmed(result);
      return result;
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403 ||
        error.code === "COMPETITION_NOT_FOUND" || error.code === "REGISTRATION_NOT_FOUND")) {
        setDenied(error);
      }
      throw error;
    } finally {
      if (!controller.signal.aborted) { write.current = null; setBusy(false); }
    }
  }

  function saveDivision(_climberId: string, divisionId: string) {
    return save(
      signal => updateClimberDetails(competitionId, climberId, { divisionId }, signal),
      registration => {
        setRead(current => current.data ? { ...current, data: { ...current.data, registration } } : current);
        setNotice('Division saved as "' + (registration.division?.name ?? "the selected division") + '".');
      },
    );
  }
  function remove() {
    return save(signal => removeClimberRegistration(competitionId, climberId, signal), () => setRemoved(true));
  }
  function refresh() { setDenied(null); setNotice(""); setRevision(value => value + 1); }

  const registration = data?.registration;
  const name = [registration?.climber?.firstName, registration?.climber?.lastName].filter(Boolean).join(" ") || "Account unavailable";
  const division = data?.divisions.find(entry => entry._id === registration?.division?._id);
  const problem = denied || read.error;
  const badLink = isInvalidCompetitionLink(problem) ? INVALID_COMPETITION_LINK
    : isInvalidLink(problem, "climberId") ? INVALID_CLIMBER_LINK : "";
  return <AppLayout title="Climber details">
    <title>Climber Details | TopSend</title>
    <div className={shared.intro}>
      <div><Link className={shared.back} to={listPath}>Back to divisions and climbers</Link>
        {data && <p className={shared.context}><strong>{data.competition.name}</strong>{data.competition.gym?.name ? ` at ${data.competition.gym.name}` : ""}</p>}
        <p className={shared.help}>Manage this climber's registration for the selected competition.</p></div>
      <button type="button" className={shared.secondary} disabled={loading || busy || removed} onClick={refresh}>Refresh climber details</button>
    </div>
    {loading ? <section className={shared.panel} aria-busy="true"><p role="status">Loading climber details…</p></section>
      : problem ? <section className={shared.panel} role="alert">
        <h2>Climber details unavailable</h2>
        <p>{badLink || readableError(problem, "Couldn't load climber details. Please try again.")}</p>
        {!badLink && <button type="button" className={shared.secondary} onClick={refresh}>Try again</button>}
      </section>
      : data && registration && (removed ? <section className={shared.panel} role="status">
        <h2 tabIndex={-1} ref={removedHeading}>Climber removed from competition</h2>
        <p>The registration has been removed from {data.competition.name}.</p>
        <Link className={shared.secondary} to={listPath}>View remaining climbers</Link>
      </section> : <>
        {notice && <p role="status" className={shared.notice}>{notice}</p>}
        {busy && <p role="status" className={shared.help}>Saving changes…</p>}
        <section className={shared.panel} aria-labelledby="climber-name">
          <h2 id="climber-name">{name}</h2>
          <dl className={styles.facts}>
            <div><dt>Email</dt><dd>{registration.climber?.email ?? "Climber account unavailable"}</dd></div>
            <div><dt>Registration status</dt><dd><span className={shared.badge} data-status={registration.status}>
              {statusLabels[registration.status] ?? "Unknown status"}</span></dd></div>
            <div><dt>Registered on</dt><dd><time dateTime={registration.registeredAt}>{formatTorontoDateTime(registration.registeredAt)}</time></dd></div>
            <div><dt>Current division</dt><dd>{division?.name ?? "No available division assigned"}</dd></div>
            <div><dt>Competition date</dt><dd><time dateTime={data.competition.date}>{formatCalendarDate(data.competition.date)}</time></dd></div>
            <div><dt>Competition location</dt><dd>{data.competition.location}</dd></div>
          </dl>
        </section>
        <section className={shared.panel} aria-labelledby="edit-division-title">
          <h2 id="edit-division-title">Change competition division</h2>
          <p className={shared.help}>Choose a division for {name === "Account unavailable" ? "this climber" : name} in {data.competition.name}.</p>
          <div className={styles.edit}>
            <ClimberDivisionControl key={revision} registration={registration} divisions={data.divisions} busy={busy} onAssign={saveDivision} />
          </div>
          {!data.divisions.length && <Link className={shared.back} to={listPath}>Create a competition division</Link>}
        </section>
        <RemoveRegistrationControl name={name} competitionName={data.competition.name} busy={busy} onRemove={remove} />
      </>)}
  </AppLayout>;
}

function RemoveRegistrationControl({ name, competitionName, busy, onRemove }: {
  name: string; competitionName: string; busy: boolean; onRemove: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const returnFocus = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirm.current?.focus();
    else if (returnFocus.current) { trigger.current?.focus(); returnFocus.current = false; }
  }, [confirming]);
  useEffect(() => { if (error && !busy) confirm.current?.focus(); }, [error, busy]);

  async function remove() {
    if (busy || submitting.current) return;
    submitting.current = true; setError("");
    try { await onRemove(); }
    catch (problem) { setError(readableError(problem, "Couldn't confirm removal. Refresh climber details before trying again.")); }
    finally { submitting.current = false; }
  }
  return <section className={`${shared.panel} ${styles.removal}`} aria-labelledby="remove-title">
    <h2 id="remove-title">Remove from competition</h2>
    <p className={shared.help}>Remove this registration from {competitionName}. The climber's account and registrations in other competitions remain available.</p>
    {confirming ? <div className={styles.confirmation}>
      <h3>Remove {name === "Account unavailable" ? "this registration" : name} from {competitionName}?</h3>
      <div className={styles.actions}>
        <button ref={confirm} type="button" className={styles.danger} disabled={busy} onClick={() => void remove()}>Confirm removal</button>
        <button type="button" className={shared.secondary} disabled={busy}
          onClick={() => { returnFocus.current = true; setConfirming(false); setError(""); }}>Cancel</button>
      </div>
      {error && <p role="alert" className={shared.fieldError}>{error}</p>}
    </div> : <button ref={trigger} type="button" className={styles.danger} disabled={busy}
      onClick={() => setConfirming(true)}>Remove registration</button>}
  </section>;
}
