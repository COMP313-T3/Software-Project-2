import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import CompetitionList from "../components/discovery/CompetitionList.tsx";
import CompetitionMap from "../components/discovery/CompetitionMap.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { discoverCompetitions, discoveryProblem, discoverySearch, DISCOVERY_FILTER_FIELDS, DISCOVERY_SEARCH_MAX_LENGTH, EMPTY_DISCOVERY_FILTERS, getDiscoveryOptions, readDiscoveryFilters, type DiscoveryFilters, type DiscoveryOptions, type DiscoveryResults } from "../lib/discoveryApi.ts";
import { validateDiscoveryFilters, type DiscoveryErrors } from "../lib/discoveryValidation.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./DiscoverCompetitionsPage.module.css";

export default function DiscoverCompetitionsPage() {
  const { user } = useSession();
  if (user?.role !== "CLIMBER") return <AccessRequired title="Climber access required" allowed="Climbers" />;
  return <DiscoveryWorkspace key={user.userId} />;
}

function DiscoveryWorkspace() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const [revision, setRevision] = useState(0);
  const [mapRevision, setMapRevision] = useState(0);
  const [mapSummary, setMapSummary] = useState("Finding competition locations…");
  const [optionsRevision, setOptionsRevision] = useState(0);
  const [options, setOptions] = useState<DiscoveryOptions | null>(null);
  const [optionsError, setOptionsError] = useState<unknown>(null);
  const [state, setState] = useState<{ key: string; revision: number; data: DiscoveryResults | null; error: unknown }>({ key: "", revision: -1, data: null, error: null });
  const loading = state.key !== key || state.revision !== revision;
  const applied = readDiscoveryFilters(params);
  const mapView = params.get("view") === "map";
  const page = Number(params.get("page") ?? 1);
  const denied = !mapView && !loading && state.error instanceof ApiError && [401, 403].includes(state.error.status);
  useEffect(() => {
    const controller = new AbortController();
    getDiscoveryOptions(controller.signal).then(data => { if (!controller.signal.aborted) { setOptions(data); setOptionsError(null); } }).catch(error => { if (!controller.signal.aborted) setOptionsError(error); });
    return () => controller.abort();
  }, [optionsRevision]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (mapView) return;
      try {
        const current = new URLSearchParams(key); const filters = readDiscoveryFilters(current);
        const nextPage = Number(current.get("page") ?? 1); const errors = validateDiscoveryFilters(filters);
        if (!Number.isSafeInteger(nextPage) || nextPage < 1) errors.page = "Page must be a whole number from 1.";
        if (Object.keys(errors).length) throw new ApiError(400, "VALIDATION_ERROR", "Check your search filters.", errors);
        const data = await discoverCompetitions(filters, nextPage, controller.signal);
        if (!controller.signal.aborted) setState({ key, revision, data, error: null });
      } catch (error) { if (!controller.signal.aborted) setState({ key, revision, data: null, error }); }
    }
    void load(); return () => controller.abort();
  }, [key, mapView, revision]);
  function apply(filters: DiscoveryFilters) {
    const next = discoverySearch(filters);
    if (mapView) next.set("view", "map");
    if (next.toString() === key) {
      if (mapView) setMapRevision(value => value + 1);
      else setRevision(value => value + 1);
    } else setParams(next);
  }
  const listQuery = discoverySearch(applied).toString();
  const listPath = `/competitions${listQuery ? `?${listQuery}` : ""}`;
  const mapParams = new URLSearchParams(listQuery);
  mapParams.set("view", "map");
  const mapPath = `/competitions?${mapParams}`;
  return <AppLayout title="Discover competitions"><title>Discover Competitions | TopSend</title>
    <section className={styles.hero}><p className={styles.eyebrow}>Find your next challenge</p><h2>Upcoming bouldering competitions</h2><p>Explore events, find your gym and choose a competition to learn more.</p></section>
    {denied ? <section className={workspace.panel} role="alert"><h2>Competition discovery unavailable</h2><p>{discoveryProblem(state.error, "Your account can't access competition discovery.")}</p><button className={workspace.secondary} type="button" onClick={() => setRevision(value => value + 1)}>Try again</button></section> : <>
      <div className={styles.layout}>
        <SearchForm key={key} applied={applied} options={options} optionsError={optionsError} serverError={!mapView && !loading ? state.error : null} onOptionsRetry={() => setOptionsRevision(value => value + 1)} onApply={apply} loading={mapView ? false : loading} resultSummary={mapView ? mapSummary : loading ? "Finding competitions…" : state.data ? `${state.data.total} ${state.data.total === 1 ? "competition" : "competitions"} found` : "Search results unavailable"} onRefresh={() => mapView ? setMapRevision(value => value + 1) : setRevision(value => value + 1)} />
        <section className={styles.results} aria-label="Competition search results" aria-busy={!mapView && loading}>
          <nav className={styles.views} aria-label="Competition views">
            <Link to={listPath} aria-current={!mapView ? "page" : undefined}>List view</Link>
            <Link to={mapPath} aria-current={mapView ? "page" : undefined}>Map view</Link>
          </nav>
          {mapView ? <CompetitionMap filters={applied} search={key} refreshRevision={mapRevision} onSummaryChange={setMapSummary} onClearFilters={() => apply({ ...EMPTY_DISCOVERY_FILTERS })} /> : loading ? <p role="status" className={workspace.panel}>Loading upcoming competitions…</p> : state.error ? <div className={workspace.panel} role="alert"><h3>Couldn't load competitions</h3><p>{discoveryProblem(state.error, "Couldn't load competitions. Please try again.")}</p><button className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></div>
            : state.data && (state.data.competitions.length ? <>
              <CompetitionList competitions={state.data.competitions} search={key} />
              <nav className={styles.pagination} aria-label="Competition result pages"><button className={workspace.secondary} disabled={state.data.page <= 1} onClick={() => setParams(discoverySearch(applied, state.data!.page - 1))}>Previous</button><span>Page {state.data.page} of {Math.max(1, Math.ceil(state.data.total / state.data.limit))}</span><button className={workspace.secondary} disabled={state.data.page * state.data.limit >= state.data.total} onClick={() => setParams(discoverySearch(applied, state.data!.page + 1))}>Next</button></nav>
            </> : <div className={workspace.panel + " " + styles.empty}><h3>No competitions match your search</h3><p>Try another date, gym or search term.</p><button className={workspace.secondary} onClick={() => apply({ ...EMPTY_DISCOVERY_FILTERS })}>Clear all filters</button></div>)}
          {!loading && state.data && !state.data.competitions.length && page > 1 && <button className={workspace.secondary} onClick={() => setParams(discoverySearch(applied))}>Back to first page</button>}
        </section>
      </div>
    </>}
  </AppLayout>;
}

function SearchForm({ applied, options, optionsError, serverError, onOptionsRetry, onApply, loading, resultSummary, onRefresh }: {
  applied: DiscoveryFilters; options: DiscoveryOptions | null; optionsError: unknown; serverError: unknown; onOptionsRetry: () => void; onApply: (filters: DiscoveryFilters) => void;
  loading: boolean; resultSummary: string; onRefresh: () => void;
}) {
  const [values, setValues] = useState(applied); const [errors, setErrors] = useState<DiscoveryErrors>({});
  const [expanded, setExpanded] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const combined = { ...(serverError instanceof ApiError ? serverError.fields : {}), ...errors };
  function change(field: keyof DiscoveryFilters, value: string) { setValues(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const filters = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "applyFilters" ? { ...values, q: applied.q } : values;
    const next = validateDiscoveryFilters(filters, options?.maxRadiusKm); setErrors(next);
    if (Object.keys(next).length) {
      const first = DISCOVERY_FILTER_FIELDS.find(field => next[field]);
      if (first !== "q") setExpanded(true);
      const target = form.current?.querySelector<HTMLElement>(`[name="${first}"]`);
      target?.focus();
      if (target && document.activeElement !== target) window.requestAnimationFrame(() => target.focus());
      return;
    }
    setExpanded(false); onApply(filters);
  }
  function toggleFilters() {
    if (expanded) {
      setValues(current => ({ ...applied, q: current.q }));
      setErrors(current => ({ q: current.q }));
    }
    setExpanded(value => !value);
  }
  function props(field: keyof DiscoveryFilters) { return { id: `discover-${field}`, name: field, value: values[field], "aria-invalid": !!combined[field], "aria-describedby": combined[field] ? `discover-${field}-error` : undefined }; }
  function error(field: keyof DiscoveryFilters) { return combined[field] ? <p id={`discover-${field}-error`} className={styles.fieldError}>{combined[field]}</p> : null; }
  return <form ref={form} className={styles.searchForm} aria-label="Search and filter competitions" noValidate onSubmit={submit}>
    <div className={workspace.panel + " " + styles.keywordSearch}><div><label htmlFor="discover-q">Search competitions</label><input {...props("q")} type="search" maxLength={DISCOVERY_SEARCH_MAX_LENGTH} placeholder="Search by event, gym or location" onFocus={() => { if (values.q && values.q === applied.q) change("q", ""); }} onChange={event => change("q", event.target.value)} /><p className={styles.help}>Search by event, gym or location. Up to 5 words.</p>{error("q")}</div><div className={styles.searchActions}><button className={workspace.primary} type="submit">Search competitions</button></div></div>
    <div className={styles.resultHeader}><div><h2>Available competitions</h2><p aria-live="polite">{resultSummary}</p></div><div className={styles.resultActions}><button type="button" className={workspace.secondary} aria-expanded={expanded} aria-controls="discovery-filter-fields" onClick={toggleFilters}>Filter</button><button className={workspace.secondary} type="button" disabled={loading} onClick={onRefresh}>Refresh results</button></div></div>
    <section id="discovery-filter-fields" className={workspace.panel + " " + styles.filters} aria-label="Competition filters" hidden={!expanded}><div className={styles.filterHeader}><h2>Filters</h2></div>
    <div className={styles.filterFields}>
    <div><label htmlFor="discover-gymId">Gym</label><select {...props("gymId")} onChange={event => change("gymId", event.target.value)}><option value="">All gyms</option>{values.gymId && !options?.gyms.some(gym => gym._id === values.gymId) && <option value={values.gymId}>Selected gym</option>}{options?.gyms.map(gym => <option value={gym._id} key={gym._id}>{gym.name} ({gym.location})</option>)}</select>{error("gymId")}</div>
    <div className={styles.dates}><div><label htmlFor="discover-from">From date</label><input {...props("from")} type="date" onChange={event => change("from", event.target.value)} />{error("from")}</div><div><label htmlFor="discover-to">To date</label><input {...props("to")} type="date" onChange={event => change("to", event.target.value)} />{error("to")}</div></div>
    <div><label htmlFor="discover-registration">Registration</label><select {...props("registration")} onChange={event => change("registration", event.target.value)}>{(options?.registration ?? [{ value: "any", label: "All upcoming competitions" }, { value: "open", label: "Registration open" }]).map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select>{error("registration")}</div>
    {(options?.hasSavedLocation || values.radiusKm) ? <div><label htmlFor="discover-radiusKm">Distance from saved location (km)</label><input {...props("radiusKm")} type="number" min={1} max={options?.maxRadiusKm ?? 200} step="any" placeholder="Any distance" onChange={event => change("radiusKm", event.target.value)} /><p className={styles.help}>Uses the location saved with your account. Only competitions whose gym has a map location are included. Leave blank for any distance.</p>{error("radiusKm")}</div> : <p className={styles.help}>Distance filtering is available when your account has a saved location.</p>}
    {!!optionsError && <div className={styles.optionsError} role="alert"><p>Gym choices couldn't be loaded. You can still search by name, date or registration.</p><button type="button" className={workspace.secondary} onClick={onOptionsRetry}>Retry filter choices</button></div>}
    <div className={styles.filterActions}><button className={workspace.primary} type="submit" name="applyFilters">Apply filters</button><button className={workspace.secondary} type="button" onClick={() => { const cleared = { ...EMPTY_DISCOVERY_FILTERS, q: applied.q }; setValues(cleared); setErrors({}); setExpanded(false); onApply(cleared); }}>Clear filters</button></div>
    </div>
    </section>
  </form>;
}
