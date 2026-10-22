import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  discoveryProblem,
  discoverySearch,
  getCompetitionMap,
  readDiscoveryFilters,
  type CompetitionMapResults,
  type DiscoveryFilters,
} from "../../lib/discoveryApi.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import MapPlaceCard from "./MapPlaceCard.tsx";
import { placesOf, type MapPlace } from "./mapPlaces.ts";
import { fitToPlaces, revealPlace, useGoogleMap, type MapLayer } from "./useGoogleMap.ts";
import styles from "./CompetitionMap.module.css";

type LoadState = {
  key: string;
  revision: number;
  data: CompetitionMapResults | null;
  error: unknown;
};

interface CompetitionMapProps {
  /** The search and filters the page applied. */
  filters: DiscoveryFilters;
  /**
   * The current discovery search without its "?", view=map included, kept in Event Details links
   * so Back to discovery returns to the map.
   */
  search: string;
  /** Raised by the page's Refresh results button to load the pins again. */
  refreshRevision: number;
  /** Receives what the page should say about the results, like "3 competitions found". */
  onSummaryChange?: (summary: string) => void;
  /** Clears the search and filters, offered when nothing matches. */
  onClearFilters?: () => void;
}

function countText(count: number): string {
  return `${count} ${count === 1 ? "competition" : "competitions"}`;
}

function summaryOf(
  loading: boolean,
  data: CompetitionMapResults | null,
  shown: number,
): string {
  if (loading) return "Finding competition locations…";
  if (!data) return "Map results unavailable";
  const found = `${countText(data.total)} found`;
  return shown === data.total ? found : `${found}, ${shown} on the map`;
}

/** Pans the map so a pin isn't hidden by the open card, when there is one. */
function showClearOfCard(
  layer: MapLayer | null,
  place: MapPlace | null,
  frame: HTMLElement | null,
  card: HTMLElement | null,
) {
  if (!layer || !place || !frame || !card) return;
  revealPlace(layer.map, place, frame.getBoundingClientRect(), card.getBoundingClientRect());
}

/**
 * The Competition Map View (US-027): available competitions as pins on a Google map, one pin per
 * place, fitted to the results of the current search. Selecting a pin shows its competitions,
 * each with a link to its Event Details page. While Google Maps loads or when it can't, the map
 * says so and links to the List View, which never depends on the map (NR-003, AC-012).
 */
export default function CompetitionMap({
  filters,
  search,
  refreshRevision,
  onSummaryChange,
  onClearFilters,
}: CompetitionMapProps) {
  const requestKey = discoverySearch(filters).toString();
  const [retryRevision, setRetryRevision] = useState(0);
  const requestRevision = refreshRevision + retryRevision;
  const [state, setState] = useState<LoadState>({
    key: "",
    revision: -1,
    data: null,
    error: null,
  });
  const loading = state.key !== requestKey || state.revision !== requestRevision;
  const { data } = state;
  const places = useMemo(() => placesOf(data?.pins ?? []), [data]);
  const shown = places.reduce((sum, place) => sum + place.competitions.length, 0);

  const [selection, setSelection] = useState<{ key: string; placeId: string } | null>(null);
  const selectionGone =
    selection !== null &&
    (selection.key !== requestKey ||
      (!loading && !places.some((place) => place.id === selection.placeId)));
  if (selectionGone) setSelection(null);
  const selected =
    selection && !selectionGone
      ? (places.find((place) => place.id === selection.placeId) ?? null)
      : null;
  const selectedId = selected?.id ?? null;

  const region = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const selectedPlace = useRef<MapPlace | null>(null);
  const closing = useRef(false);
  const fitted = useRef<{ layer: MapLayer | null; key: string }>({
    layer: null,
    key: "",
  });
  const {
    status: mapStatus,
    layer,
    retry: retryMap,
  } = useGoogleMap(mapElement, { onSelect: selectPlace, onFocus: keepClearOfCard });

  const listParams = new URLSearchParams(search);
  listParams.delete("view");
  const listPath = `/competitions${listParams.size ? `?${listParams}` : ""}`;
  const summary = summaryOf(loading, state.error ? null : data, shown);

  useEffect(() => {
    const controller = new AbortController();
    const queryFilters = readDiscoveryFilters(new URLSearchParams(requestKey));
    getCompetitionMap(queryFilters, controller.signal)
      .then((results) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, revision: requestRevision, data: results, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, revision: requestRevision, data: null, error });
        }
      });
    return () => controller.abort();
  }, [requestKey, requestRevision]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [onSummaryChange, summary]);

  useEffect(() => {
    if (!layer || loading) return;
    layer.pins.show(places);
    const key = places.map(({ id }) => id).join(" ");
    if (fitted.current.layer === layer && fitted.current.key === key) return;
    fitted.current = { layer, key };
    fitToPlaces(layer.map, places);
  }, [layer, loading, places]);

  useEffect(() => {
    selectedPlace.current = selected;
  });

  useEffect(() => {
    layer?.pins.select(selectedId);
    showClearOfCard(layer, selectedPlace.current, frame.current, card.current);
  }, [layer, selectedId]);

  function selectPlace(place: MapPlace) {
    if (state.key === requestKey) setSelection({ key: requestKey, placeId: place.id });
  }

  function keepClearOfCard(place: MapPlace) {
    if (!closing.current) showClearOfCard(layer, place, frame.current, card.current);
  }

  function focusMap() {
    region.current?.focus({ preventScroll: true });
  }

  function closeCard() {
    setSelection(null);
    closing.current = true;
    const backOnPin = selectedId !== null && layer !== null && layer.pins.focus(selectedId);
    closing.current = false;
    if (!backOnPin) focusMap();
  }

  function then(action: () => void) {
    return () => {
      action();
      focusMap();
    };
  }

  const listLink = (
    <Link className={workspace.secondary} to={listPath}>
      Open competition list
    </Link>
  );

  let overlay = null;
  if (mapStatus === "failed") {
    overlay = (
      <div className={styles.overlay} role="alert">
        <h3>Map unavailable</h3>
        <p>Google Maps couldn't load. You can still use the competition list.</p>
        <div className={styles.actions}>
          {retryMap && (
            <button type="button" className={workspace.secondary} onClick={then(retryMap)}>
              Try again
            </button>
          )}
          {listLink}
        </div>
      </div>
    );
  } else if (!loading && state.error) {
    overlay = (
      <div className={styles.overlay} role="alert">
        <h3>Couldn't load competition locations</h3>
        <p>{discoveryProblem(state.error, "Please try again.")}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={workspace.secondary}
            onClick={then(() => setRetryRevision((value) => value + 1))}
          >
            Try again
          </button>
          {listLink}
        </div>
      </div>
    );
  } else if (mapStatus === "loading") {
    overlay = (
      <p className={styles.overlay} role="status">
        Loading Google Maps…
      </p>
    );
  } else if (!loading && data?.total === 0) {
    overlay = (
      <div className={styles.overlay}>
        <h3>No competitions match your search</h3>
        <p>Try another date, gym or search term.</p>
        {onClearFilters && (
          <div className={styles.actions}>
            <button type="button" className={workspace.secondary} onClick={then(onClearFilters)}>
              Clear all filters
            </button>
          </div>
        )}
      </div>
    );
  } else if (!loading && data && places.length === 0) {
    overlay = (
      <div className={styles.overlay}>
        <h3>No map locations yet</h3>
        <p>
          {data.total === 1
            ? "This competition doesn't have a map location yet."
            : "These competitions don't have a map location yet."}{" "}
          You can find {data.total === 1 ? "it" : "them"} in the competition list.
        </p>
        <div className={styles.actions}>{listLink}</div>
      </div>
    );
  }

  const unmapped = data && !loading ? data.unmapped : 0;
  const pending = data && !loading ? data.pending : 0;
  return (
    <section
      ref={region}
      className={styles.view}
      aria-label="Competition map"
      tabIndex={-1}
    >
      <div ref={frame} className={styles.frame}>
        <div
          ref={mapElement}
          className={styles.map}
          hidden={mapStatus === "failed"}
          inert={overlay !== null}
          aria-busy={loading || mapStatus === "loading"}
        />
        {mapStatus === "ready" && loading && (
          <p className={styles.pending}>Loading competition locations…</p>
        )}
        {selected && mapStatus === "ready" && (
          <MapPlaceCard
            ref={card}
            place={selected}
            search={search}
            onClose={closeCard}
            onFocusLost={focusMap}
          />
        )}
        {overlay}
      </div>
      {unmapped > 0 && places.length > 0 && (
        <p className={styles.note}>
          {countText(unmapped)} without a map location {unmapped === 1 ? "is" : "are"} only in
          the list. <Link to={listPath}>Open competition list</Link>
        </p>
      )}
      {pending > 0 && (
        <p className={styles.note}>
          {countText(pending)} {pending === 1 ? "isn't" : "aren't"} on the map yet. Refresh
          results to add {pending === 1 ? "it" : "them"}.
        </p>
      )}
      {data?.truncated && !loading && (
        <p className={styles.note}>
          Showing the first {shown} competitions that have a map location. Narrow your search to
          see the rest.
        </p>
      )}
    </section>
  );
}
