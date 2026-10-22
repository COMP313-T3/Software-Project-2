import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ClimberDivisionControl, CreateDivisionForm } from "../components/gym-admin/DivisionControls.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { INVALID_COMPETITION_LINK, isInvalidCompetitionLink } from "../lib/competitionLink.ts";
import {
  assignClimberDivision, createCompetitionDivision, listCompetitionClimbers, listCompetitionDivisions,
  type CompetitionDivision, type ManagedClimberRegistration,
} from "../lib/divisionsApi.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import styles from "./CompetitionDivisionsPage.module.css";

interface DivisionData {
  competition: ManagedCompetitionDetails;
  divisions: CompetitionDivision[];
  climbers: ManagedClimberRegistration[];
}
const statusLabels = { CONFIRMED: "Confirmed", PENDING: "Pending", WAITLIST: "Waitlisted" };
const sortDivisions = (divisions: CompetitionDivision[]) =>
  [...divisions].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
function readableError(error: unknown) {
  return error instanceof ApiError && error.status > 0 && error.status < 500
    ? error.message : "Couldn't load divisions and climbers. Please try again.";
}

/** Organize divisions and registrations within one authorized competition. */
export default function CompetitionDivisionsPage() {
  const { user } = useSession();
  const { competitionId = "" } = useParams();
  if (user?.role !== "GYM_ADMIN") {
    return <AccessRequired title="Gym administrator access required" allowed="Gym Administrators" />;
  }
  return <DivisionWorkspace key={user.userId + ":" + competitionId} competitionId={competitionId} />;
}

function DivisionWorkspace({ competitionId }: { competitionId: string }) {
  const { search } = useLocation();
  const detailsPath = "/gym-admin/competitions/" + encodeURIComponent(competitionId) + search;
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<{ revision: number; data: DivisionData | null; error: unknown }>({
    revision: -1, data: null, error: null,
  });
  const [busy, setBusy] = useState(false);
  const [accessError, setAccessError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState(() => new URLSearchParams(search).get("divisionId") ?? "");
  const filterInput = useRef<HTMLSelectElement>(null);
  const focusFilter = useRef(false);
  const write = useRef<AbortController | null>(null);
  const loading = read.revision !== revision;
  const data = loading || accessError ? null : read.data;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      // A rejected competition read must never start its private division/climber reads.
      const competition = await getManagedCompetition(competitionId, controller.signal);
      if (controller.signal.aborted) return;
      const [divisionList, climberList] = await Promise.all([
        listCompetitionDivisions(competitionId, controller.signal),
        listCompetitionClimbers(competitionId, undefined, controller.signal),
      ]);
      if (!controller.signal.aborted) setRead({
        revision, data: { competition, divisions: sortDivisions(divisionList.divisions), climbers: climberList.climbers }, error: null,
      });
    }
    load().catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ revision, data: null, error });
    });
    return () => controller.abort();
  }, [competitionId, revision]);
  useEffect(() => () => write.current?.abort(), []);
  useEffect(() => {
    if (!busy && focusFilter.current) { filterInput.current?.focus(); focusFilter.current = false; }
  }, [busy, read]);

  /** Keep all writes serialized and update displayed values only after the API confirms them. */
  async function save<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    replace: (current: DivisionData, result: T) => DivisionData,
    message: (result: T) => string,
  ): Promise<T | undefined> {
    if (write.current || !data || accessError) return;
    const controller = new AbortController();
    write.current = controller;
    setBusy(true); setNotice("");
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted) return;
      setRead(current => current.data ? { ...current, data: replace(current.data, result) } : current);
      setNotice(message(result));
      return result;
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.code === "COMPETITION_NOT_FOUND")) {
        setAccessError(error);
      }
      throw error;
    } finally {
      if (!controller.signal.aborted) { write.current = null; setBusy(false); }
    }
  }

  function create(name: string) {
    return save(
      signal => createCompetitionDivision(competitionId, { name }, signal),
      (current, result) => ({ ...current, divisions: sortDivisions([...current.divisions, result]) }),
      result => 'Division "' + result.name + '" created.',
    );
  }
  function assign(climberId: string, divisionId: string) {
    return save(
      signal => assignClimberDivision(competitionId, climberId, divisionId, signal),
      (current, result) => {
        const previous = current.climbers.find(entry => entry.registrationId === result.registrationId);
        const previousDivision = previous?.division?._id;
        const nextDivision = result.division?._id;
        return {
          ...current,
          climbers: current.climbers.map(entry => entry.registrationId === result.registrationId ? result : entry),
          divisions: current.divisions.map(division => {
            if (previousDivision === nextDivision) return division;
            const change = division._id === previousDivision ? -1 : division._id === nextDivision ? 1 : 0;
            return { ...division, climberCount: Math.max(0, division.climberCount + change) };
          }),
        };
      },
      result => {
        if (filter && result.division?._id !== filter) focusFilter.current = true;
        return [result.climber?.firstName, result.climber?.lastName].filter(Boolean).join(" ") +
          ' is assigned to "' + (result.division?.name ?? "the selected division") + '".';
      },
    );
  }

  const activeFilter = data?.divisions.some(division => division._id === filter) ? filter : "";
  const returnFilters = new URLSearchParams(search);
  if (activeFilter) returnFilters.set("divisionId", activeFilter);
  else returnFilters.delete("divisionId");
  const detailsSearch = returnFilters.size ? "?" + returnFilters.toString() : "";
  const visible = data?.climbers.filter(entry => !activeFilter || entry.division?._id === activeFilter) ?? [];
  const confirmed = data?.climbers.filter(entry => entry.status === "CONFIRMED").length ?? 0;
  const problem = accessError || read.error;
  const badLink = isInvalidCompetitionLink(problem);
  return <AppLayout title="Divisions and climbers">
    <title>Divisions and Climbers | TopSend</title>
    <div className={styles.intro}>
      <div><Link className={styles.back} to={detailsPath}>Back to competition</Link>
        {data && <p className={styles.context}><strong>{data.competition.name}</strong>{data.competition.gym?.name ? ` at ${data.competition.gym.name}` : ""}</p>}
        <p className={styles.help}>Create event categories and place climbers in the right division.</p></div>
      <button type="button" className={styles.secondary} disabled={loading || busy}
        onClick={() => { setNotice(""); setAccessError(null); setRevision(value => value + 1); }}>
        Refresh divisions and climbers
      </button>
    </div>
    {loading ? <section className={styles.panel} aria-busy="true"><p role="status">Loading divisions and climbers…</p></section>
      : problem ? <section className={styles.panel} role="alert">
        <h2>{accessError ? "Competition access unavailable" : "Divisions and climbers unavailable"}</h2>
        <p>{badLink ? INVALID_COMPETITION_LINK : readableError(problem)}</p>
        {!badLink && <button type="button" className={styles.secondary} onClick={() => { setAccessError(null); setRevision(value => value + 1); }}>Try again</button>}
      </section>
      : data && <>
        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {busy && <p role="status" className={styles.help}>Saving changes…</p>}
        <div className={styles.summary} aria-label="Competition grouping summary">
          <div><span>Divisions</span><strong>{data.divisions.length}</strong></div>
          <div><span>Climber registrations</span><strong>{data.climbers.length}</strong></div>
          <div><span>Confirmed climbers</span><strong>{confirmed}</strong></div>
        </div>
        <section className={styles.panel} aria-labelledby="divisions-title">
          <h2 id="divisions-title">Competition divisions</h2>
          <CreateDivisionForm busy={busy} onCreate={create} />
          {data.divisions.length ? <ul className={styles.divisions} aria-label="Divisions">
            {data.divisions.map(division => <li key={division._id}>
              <strong>{division.name}</strong><span>{division.climberCount} {division.climberCount === 1 ? "registration" : "registrations"}</span>
            </li>)}
          </ul> : <p className={styles.empty}>No divisions yet. Create the first division for this competition.</p>}
        </section>
        <section className={styles.panel} aria-labelledby="climbers-title">
          <div className={styles.listHeader}>
            <div><h2 id="climbers-title">Registered climbers</h2>
              <p className={styles.help}>{visible.length} {activeFilter ? "matching" : "total"} {visible.length === 1 ? "registration" : "registrations"}, {confirmed} confirmed in this competition</p></div>
            <div className={styles.filter}><label htmlFor="division-filter">Show division</label>
              <select id="division-filter" ref={filterInput} value={activeFilter} disabled={busy}
                onChange={event => setFilter(event.target.value)}>
                <option value="">All divisions</option>
                {data.divisions.map(division => <option key={division._id} value={division._id}>{division.name}</option>)}
              </select>
            </div>
          </div>
          {!data.climbers.length ? <p className={styles.empty}>No climber registrations for this competition yet.</p>
            : !visible.length ? <p className={styles.empty}>No climbers in this division.</p>
            : <ul className={styles.climbers} aria-label="Climber registrations">
              {visible.map(registration => {
                const name = [registration.climber?.firstName, registration.climber?.lastName].filter(Boolean).join(" ") || "Account unavailable";
                const division = data.divisions.find(entry => entry._id === registration.division?._id);
                return <li key={registration.registrationId} className={styles.climber}>
                  <div className={styles.identity}><h3>{name}</h3><p>{registration.climber?.email ?? "Climber account unavailable"}</p>
                    <span className={styles.badge} data-status={registration.status}>{statusLabels[registration.status] ?? "Unknown status"}</span>
                    {registration.climber && <p><Link className={styles.back}
                      to={"/gym-admin/competitions/" + encodeURIComponent(competitionId) + "/climbers/" + encodeURIComponent(registration.climber._id) + detailsSearch}
                      aria-label={"View details for " + name}>View details</Link></p>}
                  </div>
                  <div className={styles.assignment}><p className={styles.help}>Current division</p>
                    <p className={styles.current}>{division?.name ?? "No available division assigned"}</p>
                    <ClimberDivisionControl registration={registration} divisions={data.divisions} busy={busy} onAssign={assign} />
                  </div>
                </li>;
              })}
            </ul>}
        </section>
      </>}
  </AppLayout>;
}
