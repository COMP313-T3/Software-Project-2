import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout.tsx";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import CompetitionList from "../components/discovery/CompetitionList.tsx";
import CompetitionMap from "../components/discovery/CompetitionMap.tsx";
import StartingPlaceField from "../components/discovery/StartingPlaceField.tsx";
import { useCurrentLocation } from "../components/discovery/useCurrentLocation.ts";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";
import { findCurrentLocation, forgetCurrentLocation, freshLocation, locationProblem } from "../lib/currentLocation.ts";
import { discoverCompetitions, discoveryProblem, discoverySearch, DISCOVERY_DISTANCE_CHOICES_KM, DISCOVERY_FILTER_FIELDS, DISCOVERY_SEARCH_MAX_LENGTH, DISCOVERY_SORT_CHOICES, EMPTY_DISCOVERY_FILTERS, getDiscoveryOptions, newShuffleSeed, readDiscoveryFilters, type DiscoveryFilters, type DiscoveryOptions, type DiscoveryResults, type StartingPoint } from "../lib/discoveryApi.ts";
import { validateDiscoveryFilters, type DiscoveryErrors } from "../lib/discoveryValidation.ts";
import { GOOGLE_MAPS_API_KEY } from "../lib/googleMaps.ts";
import workspace from "../components/gym-admin/GymAdminDashboard.module.css";
import styles from "./DiscoverCompetitionsPage.module.css";

export default function DiscoverCompetitionsPage() {
  const { user } = useSession();
  if (user?.role !== "CLIMBER") return <AccessRequired title="Climber access required" allowed="Climbers" />;
  return <DiscoveryWorkspace key={user.userId} userId={user.userId} />;
}

/** The starting point and distance in words, for the line under the result count. */
function startingPointText(filters: DiscoveryFilters): string {
  const from = filters.near === "current" ? "your current location" : filters.near === "saved" ? "your saved location" : filters.place.trim() || "the place you chose";
  return `Distances are from ${from}${filters.radiusKm.trim() ? `, within ${filters.radiusKm.trim()} km` : ""}.`;
}

/** The search and filters without the order, in the address bar's order, so two addresses for the same search match. */
function filtersKey(filters: DiscoveryFilters): string {
  return discoverySearch({ ...filters, sort: "", seed: "" }).toString();
}

/** Drops what the chosen starting point and order don't use, so the address bar only keeps what applies. */
function tidy(filters: DiscoveryFilters): DiscoveryFilters {
  const place = filters.near === "place";
  const sort = !filters.near && filters.sort === "closest" ? "" : filters.sort;
  return {
    ...filters, lat: place ? filters.lat : "", lng: place ? filters.lng : "", place: place ? filters.place.trim() : "",
    radiusKm: filters.near ? filters.radiusKm : "", sort, seed: sort === "random" ? filters.seed : "",
  };
}

function DiscoveryWorkspace({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const latest = useRef({ params, setParams });
  useLayoutEffect(() => { latest.current = { params, setParams }; });
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);
  const [revision, setRevision] = useState(0);
  const [mapRevision, setMapRevision] = useState(0);
  const [mapSummary, setMapSummary] = useState("Finding competition locations…");
  const [optionsRevision, setOptionsRevision] = useState(0);
  const [options, setOptions] = useState<DiscoveryOptions | null>(null);
  const [optionsError, setOptionsError] = useState<unknown>(null);
  const [state, setState] = useState<{ key: string; revision: number; data: DiscoveryResults | null; error: unknown }>({ key: "", revision: -1, data: null, error: null });
  const applied = readDiscoveryFilters(params);
  const here = useCurrentLocation(applied.near === "current", userId);
  const waitingForLocation = applied.near === "current" && !here.point;
  const pointKey = applied.near === "current" && here.point ? `${here.point.lat},${here.point.lng}` : "";
  const searched = applied.near === "current" && here.point ? { ...applied, lat: String(here.point.lat), lng: String(here.point.lng) } : applied;
  const loadKey = `${key}|${pointKey}`;
  const loading = state.key !== loadKey || state.revision !== revision;
  const mapView = params.get("view") === "map";
  const page = Number(params.get("page") ?? 1);
  const denied = !mapView && !waitingForLocation && !loading && state.error instanceof ApiError && [401, 403].includes(state.error.status);
  useEffect(() => {
    const controller = new AbortController();
    getDiscoveryOptions(controller.signal).then(data => { if (!controller.signal.aborted) { setOptions(data); setOptionsError(null); } }).catch(error => { if (!controller.signal.aborted) setOptionsError(error); });
    return () => controller.abort();
  }, [optionsRevision]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (mapView || waitingForLocation) return;
      try {
        const current = new URLSearchParams(key); const filters = readDiscoveryFilters(current);
        if (pointKey) [filters.lat, filters.lng] = pointKey.split(",");
        const nextPage = Number(current.get("page") ?? 1); const errors = validateDiscoveryFilters(filters);
        if (!Number.isSafeInteger(nextPage) || nextPage < 1) errors.page = "Page must be a whole number from 1.";
        if (Object.keys(errors).length) throw new ApiError(400, "VALIDATION_ERROR", "Check your search filters.", errors);
        const data = await discoverCompetitions(filters, nextPage, controller.signal);
        if (!controller.signal.aborted) setState({ key: loadKey, revision, data, error: null });
      } catch (error) { if (!controller.signal.aborted) setState({ key: loadKey, revision, data: null, error }); }
    }
    void load(); return () => controller.abort();
  }, [key, loadKey, mapView, pointKey, revision, waitingForLocation]);
  /**
   * Shows the search for these filters in the view that's open now. A search that waited for the
   * Climber's location can finish after they changed the view, the order, or the filters, or left
   * the page, so the address bar is read as it is then, and nothing is shown once the page is closed.
   *
   * @param filters The search and filters to show.
   * @param options keepOrder keeps the order that's applied now, for the form's searches, which
   *   don't choose one. onlyFrom is the filtersKey the search started from: if other filters were
   *   applied while it waited, it's dropped.
   */
  function apply(filters: DiscoveryFilters, { keepOrder = false, onlyFrom }: { keepOrder?: boolean; onlyFrom?: string } = {}) {
    if (!open.current) return;
    const { params: now, setParams: show } = latest.current;
    const showing = readDiscoveryFilters(now);
    if (onlyFrom !== undefined && filtersKey(showing) !== onlyFrom) return;
    const next = discoverySearch(keepOrder ? tidy({ ...filters, sort: showing.sort, seed: showing.seed }) : filters);
    const onMap = now.get("view") === "map";
    if (onMap) next.set("view", "map");
    if (next.toString() === now.toString()) {
      if (onMap) setMapRevision(value => value + 1);
      else setRevision(value => value + 1);
    } else show(next);
  }
  /** Starts the applied search from where the Climber is, once the browser has given it, keeping anything else they changed while it was asked. */
  function startFromCurrentLocation() {
    const showing = readDiscoveryFilters(latest.current.params);
    if (showing.near !== "current") apply(tidy({ ...showing, near: "current" }));
  }
  function withoutLocation() { apply(tidy({ ...applied, near: "" })); }
  const listQuery = discoverySearch(applied).toString();
  const listPath = `/competitions${listQuery ? `?${listQuery}` : ""}`;
  const mapParams = new URLSearchParams(listQuery);
  mapParams.set("view", "map");
  const mapPath = `/competitions?${mapParams}`;
  const summary = waitingForLocation ? (here.problem ? "Your location couldn't be found" : "Finding your location…")
    : mapView ? mapSummary : loading ? "Finding competitions…" : state.data ? `${state.data.total} ${state.data.total === 1 ? "competition" : "competitions"} found` : "Search results unavailable";
  return <AppLayout title="Discover competitions"><title>Discover Competitions | TopSend</title>
    <section className={styles.hero}><p className={styles.eyebrow}>Find your next challenge</p><h2>Upcoming bouldering competitions</h2><p>Explore events, find your gym and choose a competition to learn more.</p></section>
    {denied ? <section className={workspace.panel} role="alert"><h2>Competition discovery unavailable</h2><p>{discoveryProblem(state.error, "Your account can't access competition discovery.")}</p><button className={workspace.secondary} type="button" onClick={() => setRevision(value => value + 1)}>Try again</button></section> : <>
      <div className={styles.layout}>
        <SearchForm userId={userId} applied={applied} options={options} optionsError={optionsError} serverError={!mapView && !waitingForLocation && !loading ? state.error : null} onOptionsRetry={() => setOptionsRevision(value => value + 1)} onApply={apply} onStartFromLocation={startFromCurrentLocation} onRefreshLocation={here.retry} showSort={!mapView} loading={mapView || waitingForLocation ? false : loading} resultSummary={summary} startingPoint={applied.near && !waitingForLocation ? startingPointText(applied) : ""} onRefresh={() => mapView ? setMapRevision(value => value + 1) : setRevision(value => value + 1)} />
        <section className={styles.results} aria-label="Competition search results" aria-busy={waitingForLocation ? !here.problem : !mapView && loading}>
          <nav className={styles.views} aria-label="Competition views">
            <Link to={listPath} aria-current={!mapView ? "page" : undefined}>List view</Link>
            <Link to={mapPath} aria-current={mapView ? "page" : undefined}>Map view</Link>
          </nav>
          {waitingForLocation ? here.problem ? <div className={workspace.panel} role="alert"><h3>Couldn't use your location</h3><p>{here.problem}</p><div className={styles.panelActions}><button type="button" className={workspace.secondary} onClick={here.retry}>Try again</button><button type="button" className={workspace.secondary} onClick={withoutLocation}>Search without your location</button></div></div>
            : <p role="status" className={workspace.panel}>Finding your location…</p>
            : mapView ? <CompetitionMap filters={searched} search={key} refreshRevision={mapRevision} onSummaryChange={setMapSummary} onClearFilters={() => apply({ ...EMPTY_DISCOVERY_FILTERS })} /> : loading ? <p role="status" className={workspace.panel}>Loading upcoming competitions…</p> : state.error ? <div className={workspace.panel} role="alert"><h3>Couldn't load competitions</h3><p>{discoveryProblem(state.error, "Couldn't load competitions. Please try again.")}</p><button className={workspace.secondary} onClick={() => setRevision(value => value + 1)}>Try again</button></div>
            : state.data && (state.data.competitions.length ? <>
              <CompetitionList competitions={state.data.competitions} search={key} />
              <nav className={styles.pagination} aria-label="Competition result pages"><button className={workspace.secondary} disabled={state.data.page <= 1} onClick={() => setParams(discoverySearch(applied, state.data!.page - 1))}>Previous</button><span>Page {state.data.page} of {Math.max(1, Math.ceil(state.data.total / state.data.limit))}</span><button className={workspace.secondary} disabled={state.data.page * state.data.limit >= state.data.total} onClick={() => setParams(discoverySearch(applied, state.data!.page + 1))}>Next</button></nav>
            </> : <div className={workspace.panel + " " + styles.empty}><h3>No competitions match your search</h3><p>{applied.radiusKm ? "Try a longer distance, another date, gym or search term." : "Try another date, gym or search term."}</p><button className={workspace.secondary} onClick={() => apply({ ...EMPTY_DISCOVERY_FILTERS })}>Clear all filters</button></div>)}
          {!waitingForLocation && !loading && state.data && !state.data.competitions.length && page > 1 && <button className={workspace.secondary} onClick={() => setParams(discoverySearch(applied))}>Back to first page</button>}
        </section>
      </div>
    </>}
  </AppLayout>;
}

const STARTING_POINTS: { value: StartingPoint; label: string }[] = [
  { value: "", label: "None" }, { value: "current", label: "My current location" },
  { value: "place", label: "A place I search for" }, { value: "saved", label: "My saved location" },
];

function SearchForm({ userId, applied, options, optionsError, serverError, onOptionsRetry, onApply, onStartFromLocation, onRefreshLocation, showSort, loading, resultSummary, startingPoint, onRefresh }: {
  userId: string; applied: DiscoveryFilters; options: DiscoveryOptions | null; optionsError: unknown; serverError: unknown; onOptionsRetry: () => void;
  onApply: (filters: DiscoveryFilters, options?: { keepOrder?: boolean; onlyFrom?: string }) => void; onStartFromLocation: () => void;
  onRefreshLocation: () => void; showSort: boolean; loading: boolean; resultSummary: string; startingPoint: string; onRefresh: () => void;
}) {
  const [values, setValues] = useState(applied); const [errors, setErrors] = useState<DiscoveryErrors>({});
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  // The form isn't remounted for another page, view, or order, so focus and a question to the
  // browser carry over. When other filters are applied, as with the browser's Back button, it
  // starts over from them.
  const appliedFilters = filtersKey(applied);
  const [shownFilters, setShownFilters] = useState(appliedFilters);
  if (shownFilters !== appliedFilters) {
    setShownFilters(appliedFilters);
    setValues(applied); setErrors({}); setExpanded(false); setLocationError("");
  }
  const form = useRef<HTMLFormElement>(null);
  const combined = { ...(serverError instanceof ApiError ? serverError.fields : {}), ...errors };
  const placesOffered = GOOGLE_MAPS_API_KEY !== "";
  const savedOffered = Boolean(options?.hasSavedLocation) || values.near === "saved";
  const startingPoints = STARTING_POINTS.filter(choice => (choice.value !== "place" || placesOffered || values.near === "place") && (choice.value !== "saved" || savedOffered));
  const distances = options?.distanceChoicesKm?.length ? options.distanceChoicesKm : DISCOVERY_DISTANCE_CHOICES_KM;
  const sorts = options?.sorts?.length ? options.sorts : DISCOVERY_SORT_CHOICES;
  function change(field: keyof DiscoveryFilters, value: string) { setValues(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined })); }
  function chooseStartingPoint(near: StartingPoint) {
    setValues(current => ({ ...current, near, ...(near ? {} : { radiusKm: "" }) }));
    setErrors(current => ({ ...current, near: undefined, radiusKm: undefined, sort: undefined }));
  }
  function focusField(field: keyof DiscoveryFilters) {
    const selector = field === "near" ? (values.near === "place" ? "#address" : '[name="near"]:checked') : `[name="${field}"]`;
    const target = form.current?.querySelector<HTMLElement>(selector) ?? form.current?.querySelector<HTMLElement>(`[name="${field}"]`);
    target?.focus();
    if (target && document.activeElement !== target) window.requestAnimationFrame(() => target.focus());
  }
  /** Gets where the Climber is before a search that starts there, unless it was found a moment ago. */
  async function locate(): Promise<boolean> {
    if (freshLocation(userId)) return true;
    setLocating(true); setLocationError("");
    try { await findCurrentLocation(userId); return true; }
    catch (error) { setLocationError(locationProblem(error)); return false; }
    finally { setLocating(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "applyFilters" ? { ...values, q: applied.q } : values;
    const filters = tidy({ ...chosen, sort: applied.sort, seed: applied.seed });
    const startedFrom = filtersKey(applied);
    const next = validateDiscoveryFilters(filters, options?.maxRadiusKm, options?.hasSavedLocation ?? true); setErrors(next);
    if (Object.keys(next).length) {
      const first = DISCOVERY_FILTER_FIELDS.find(field => next[field]);
      if (first && first !== "q" && first !== "sort") setExpanded(true);
      if (first) focusField(first);
      return;
    }
    if (filters.near === "current" && !(await locate())) {
      setExpanded(true); window.requestAnimationFrame(() => focusField("near"));
      return;
    }
    setExpanded(false); onApply(filters, { keepOrder: true, onlyFrom: startedFrom });
  }
  async function startFromMyLocation() {
    if (applied.near === "current") { onRefreshLocation(); return; }
    forgetCurrentLocation();
    if (await locate()) onStartFromLocation();
  }
  function sortBy(sort: string) {
    onApply(tidy({ ...applied, sort: sort === "soonest" ? "" : sort, seed: sort === "random" ? newShuffleSeed() : "" }));
  }
  function toggleFilters() {
    if (expanded) {
      setValues(current => ({ ...applied, q: current.q }));
      setErrors(current => ({ q: current.q }));
      setLocationError("");
    }
    setExpanded(value => !value);
  }
  function props(field: keyof DiscoveryFilters, help?: string) {
    const describedBy = [help, combined[field] ? `discover-${field}-error` : ""].filter(Boolean).join(" ");
    return { id: `discover-${field}`, name: field, value: values[field], "aria-invalid": !!combined[field], "aria-describedby": describedBy || undefined };
  }
  function error(field: keyof DiscoveryFilters) { return combined[field] ? <p id={`discover-${field}-error`} className={styles.fieldError}>{combined[field]}</p> : null; }
  const appliedSort = applied.sort || "soonest";
  const nearError = combined.near ?? (expanded ? locationError : "");
  return <form ref={form} className={styles.searchForm} aria-label="Search and filter competitions" noValidate onSubmit={event => void submit(event)}>
    <div className={workspace.panel + " " + styles.keywordSearch}><div><label htmlFor="discover-q">Search competitions</label><input {...props("q")} type="search" maxLength={DISCOVERY_SEARCH_MAX_LENGTH} placeholder="Search by event, gym or location" onFocus={() => { if (values.q && values.q === applied.q) change("q", ""); }} onChange={event => change("q", event.target.value)} /><p className={styles.help}>Search by event, gym or location. Up to 5 words.</p>{error("q")}
      {!expanded && locationError && <p className={styles.fieldError} role="alert">{locationError}</p>}</div>
      <div className={styles.searchActions}><button className={workspace.primary} type="submit" disabled={locating}>Search competitions</button><button className={workspace.secondary} type="button" disabled={locating} onClick={() => void startFromMyLocation()}>{locating && !expanded ? "Finding your location…" : "Use my location"}</button></div></div>
    <div className={styles.resultHeader}><div><h2>Available competitions</h2><p aria-live="polite">{resultSummary}</p>{startingPoint && <p className={styles.startingPointNote}>{startingPoint}</p>}</div><div className={styles.resultActions}>
      {showSort && <div className={styles.sort}><label htmlFor="discover-sort">Sort by</label><select id="discover-sort" name="sort" value={appliedSort} aria-invalid={!!combined.sort} aria-describedby={combined.sort ? "discover-sort-error" : undefined} onChange={event => sortBy(event.target.value)}>
        {sorts.map(choice => <option key={choice.value} value={choice.value} disabled={choice.value === "closest" && !applied.near}>{choice.value === "closest" && !applied.near ? `${choice.label} (choose a starting point)` : choice.label}</option>)}
      </select>{combined.sort && <p id="discover-sort-error" className={styles.fieldError}>{combined.sort}</p>}</div>}
      {showSort && applied.sort === "random" && <button type="button" className={workspace.secondary} onClick={() => sortBy("random")}>Shuffle again</button>}
      <button type="button" className={workspace.secondary} aria-expanded={expanded} aria-controls="discovery-filter-fields" onClick={toggleFilters}>Filter</button><button className={workspace.secondary} type="button" disabled={loading} onClick={onRefresh}>Refresh results</button></div></div>
    <section id="discovery-filter-fields" className={workspace.panel + " " + styles.filters} aria-label="Competition filters" hidden={!expanded}><div className={styles.filterHeader}><h2>Filters</h2></div>
    <div className={styles.filterFields}>
    <div><label htmlFor="discover-gymId">Gym</label><select {...props("gymId")} onChange={event => change("gymId", event.target.value)}><option value="">All gyms</option>{values.gymId && !options?.gyms.some(gym => gym._id === values.gymId) && <option value={values.gymId}>Selected gym</option>}{options?.gyms.map(gym => <option value={gym._id} key={gym._id}>{gym.name} ({gym.location})</option>)}</select>{error("gymId")}</div>
    <div className={styles.dates}><div><label htmlFor="discover-from">From date</label><input {...props("from")} type="date" onChange={event => change("from", event.target.value)} />{error("from")}</div><div><label htmlFor="discover-to">To date</label><input {...props("to")} type="date" onChange={event => change("to", event.target.value)} />{error("to")}</div></div>
    <fieldset className={styles.startingPoint} aria-describedby={"discover-near-help" + (nearError && values.near !== "place" ? " discover-near-error" : "")}>
      <legend>Starting point</legend>
      <p id="discover-near-help" className={styles.help}>Shows how far each competition's gym is, and lets you sort by distance or keep the nearby ones.</p>
      <div className={styles.choices}>{startingPoints.map(choice => <label key={choice.value || "none"} className={styles.choice}><input type="radio" name="near" value={choice.value} checked={values.near === choice.value} aria-invalid={!!nearError && values.near === choice.value} onChange={() => chooseStartingPoint(choice.value)} />{choice.label}</label>)}</div>
      {values.near === "current" && <p className={styles.help} aria-live="polite">{locating ? "Finding your location…" : "Your browser asks before sharing your location. TopSend only uses it for this search and doesn't save it."}</p>}
      {values.near === "place" && <div className={styles.place}><StartingPlaceField value={values.place} point={values.lat && values.lng ? { lat: Number(values.lat), lng: Number(values.lng) } : null} error={nearError || undefined}
        onChange={text => { setValues(current => ({ ...current, place: text, lat: "", lng: "" })); setErrors(current => ({ ...current, near: undefined })); }}
        onChosen={(name, point) => { setValues(current => ({ ...current, place: name, lat: String(point.lat), lng: String(point.lng) })); setErrors(current => ({ ...current, near: undefined })); }} /></div>}
      {values.near !== "place" && nearError && <p id="discover-near-error" className={styles.fieldError}>{nearError}</p>}
    </fieldset>
    <div><label htmlFor="discover-radiusKm">Distance</label><select {...props("radiusKm", "discover-radiusKm-help")} disabled={!values.near} onChange={event => change("radiusKm", event.target.value)}><option value="">Any distance</option>{distances.map(km => <option key={km} value={String(km)}>Within {km} km</option>)}{values.radiusKm && !distances.some(km => String(km) === values.radiusKm.trim()) && <option value={values.radiusKm}>Within {values.radiusKm} km</option>}</select><p id="discover-radiusKm-help" className={styles.help}>{values.near ? "Only competitions whose gym has a map location are included." : "Choose a starting point to search by distance."}</p>{error("radiusKm")}</div>
    <div><label htmlFor="discover-registration">Registration</label><select {...props("registration")} onChange={event => change("registration", event.target.value)}>{(options?.registration ?? [{ value: "any", label: "All upcoming competitions" }, { value: "open", label: "Registration open" }]).map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select>{error("registration")}</div>
    {!!optionsError && <div className={styles.optionsError} role="alert"><p>Gym choices couldn't be loaded. You can still search by name, date or registration.</p><button type="button" className={workspace.secondary} onClick={onOptionsRetry}>Retry filter choices</button></div>}
    <div className={styles.filterActions}><button className={workspace.primary} type="submit" name="applyFilters" disabled={locating}>Apply filters</button><button className={workspace.secondary} type="button" disabled={locating} onClick={() => { const cleared = tidy({ ...EMPTY_DISCOVERY_FILTERS, q: applied.q, sort: applied.sort, seed: applied.seed }); setValues(cleared); setErrors({}); setLocationError(""); setExpanded(false); onApply(cleared); }}>Clear filters</button></div>
    </div>
    </section>
  </form>;
}
