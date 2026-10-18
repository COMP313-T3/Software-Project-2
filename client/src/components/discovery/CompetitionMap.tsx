import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatCalendarDate } from "../../lib/dateFormat.ts";
import {
  getCompetitionMap,
  type CompetitionMapResults,
  type DiscoveredCompetition,
  type DiscoveryFilters,
  discoveryProblem,
  discoverySearch,
  readDiscoveryFilters,
} from "../../lib/discoveryApi.ts";
import {
  GOOGLE_MAP_ID,
  loadGoogleMaps,
  type GoogleMap,
  type LatLngLiteral,
} from "../../lib/googleMaps.ts";
import workspace from "../gym-admin/GymAdminDashboard.module.css";
import styles from "./CompetitionMap.module.css";

const MAP_CENTER: LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
const MAP_ERROR = "Google Maps couldn't load. You can still use the competition list.";

type LoadState = {
  key: string;
  revision: number;
  data: CompetitionMapResults | null;
  error: unknown;
};

interface CompetitionMapProps {
  filters: DiscoveryFilters;
  search: string;
  refreshRevision: number;
}

function validCoordinates(
  position: DiscoveredCompetition["coordinates"],
): position is LatLngLiteral {
  return (
    position !== null &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

function eventDetailsPath(competitionId: string, search: string) {
  return `/competitions/${encodeURIComponent(competitionId)}${search ? `?${search}` : ""}`;
}

export default function CompetitionMap({
  filters,
  search,
  refreshRevision,
}: CompetitionMapProps) {
  const requestKey = discoverySearch(filters).toString();
  const mapElement = useRef<HTMLDivElement>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestRevision = refreshRevision + retryRevision;
  const [state, setState] = useState<LoadState>({
    key: "",
    revision: -1,
    data: null,
    error: null,
  });
  const [mapState, setMapState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loading = state.key !== requestKey || state.revision !== requestRevision;
  const pins = useMemo(
    () =>
      (state.data?.pins ?? []).filter(({ coordinates }) =>
        validCoordinates(coordinates),
      ),
    [state.data?.pins],
  );
  const selected = pins.find(({ _id }) => _id === selectedId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    const queryFilters = readDiscoveryFilters(new URLSearchParams(requestKey));
    getCompetitionMap(queryFilters, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, revision: requestRevision, data, error: null });
          setSelectedId(null);
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
    const element = mapElement.current;
    if (element === null) return;
    if (
      !state.data ||
      state.key !== requestKey ||
      state.revision !== requestRevision
    ) {
      return;
    }
    let active = true;
    const markers: { map: GoogleMap | null }[] = [];

    async function buildMap(container: HTMLDivElement) {
      setMapState("loading");
      const maps = await loadGoogleMaps();
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        maps.importLibrary("maps"),
        maps.importLibrary("marker"),
      ]);
      if (!active) return;

      const positions = pins.flatMap(({ coordinates }) =>
        validCoordinates(coordinates) ? [coordinates] : [],
      );
      const center =
        positions.length > 0
          ? {
              lat:
                positions.reduce((total, position) => total + position.lat, 0) /
                positions.length,
              lng:
                positions.reduce((total, position) => total + position.lng, 0) /
                positions.length,
            }
          : MAP_CENTER;
      const mapInstance = new Map(container, {
        center,
        zoom: positions.length === 1 ? 12 : positions.length > 1 ? 6 : 5,
        mapId: GOOGLE_MAP_ID,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      pins.forEach((pin) => {
        if (!validCoordinates(pin.coordinates)) return;
        const marker = new AdvancedMarkerElement({
          map: mapInstance,
          position: pin.coordinates,
          gmpDraggable: false,
          gmpClickable: true,
          title: `${pin.name} at ${pin.gym?.name ?? "Gym"}`,
        });
        marker.addEventListener("gmp-click", () => setSelectedId(pin._id));
        markers.push(marker);
      });
      setMapState("ready");
    }

    void buildMap(element).catch(() => {
      if (active) {
        markers.forEach((marker) => {
          marker.map = null;
        });
        element.replaceChildren();
        setMapState("failed");
      }
    });

    return () => {
      active = false;
      markers.forEach((marker) => {
        marker.map = null;
      });
      element.replaceChildren();
    };
  }, [pins, requestKey, requestRevision, state.data, state.key, state.revision]);

  const searchParams = new URLSearchParams(search);
  searchParams.delete("view");
  const detailsSearch = searchParams.toString();

  if (loading) {
    return (
      <p className={`${workspace.panel} ${styles.message}`} role="status">
        Loading competition locations…
      </p>
    );
  }

  if (state.error) {
    return (
      <section className={`${workspace.panel} ${styles.message}`} role="alert">
        <h3>Couldn't load competition locations</h3>
        <p>{discoveryProblem(state.error, "Please try again.")}</p>
        <button
          type="button"
          className={workspace.secondary}
          onClick={() => setRetryRevision((current) => current + 1)}
        >
          Try again
        </button>
        <Link
          className={workspace.secondary}
          to={`/competitions${detailsSearch ? `?${detailsSearch}` : ""}`}
        >
          Open competition list
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.view} aria-label="Competition map">
      <div className={styles.mapFrame} aria-busy={mapState === "loading"}>
        <div ref={mapElement} className={styles.map} />
        {mapState !== "ready" && (
          <p
            className={styles.mapMessage}
            role={mapState === "failed" ? "alert" : "status"}
          >
            {mapState === "loading" ? "Loading Google Maps…" : MAP_ERROR}
          </p>
        )}
      </div>
      {state.data && state.data.unmapped > 0 && (
        <p className={styles.note} role="status">
          {state.data.unmapped}{" "}
          {state.data.unmapped === 1 ? "competition doesn't" : "competitions don't"}{" "}
          have a valid map location and {state.data.unmapped === 1 ? "is" : "are"}{" "}
          not shown.
        </p>
      )}
      {state.data?.truncated && (
        <p className={styles.note}>
          Showing the first {pins.length} mapped competitions. Use the filters to
          narrow the results.
        </p>
      )}
      {mapState === "failed" && (
        <Link
          className={workspace.secondary}
          to={`/competitions${detailsSearch ? `?${detailsSearch}` : ""}`}
        >
          Open competition list
        </Link>
      )}
      {state.data?.total === 0 ? (
        <div className={`${workspace.panel} ${styles.message}`}>
          <h3>No competitions match your search</h3>
          <p>Try another date, gym or search term.</p>
        </div>
      ) : pins.length === 0 && state.data ? (
        <div className={`${workspace.panel} ${styles.message}`}>
          <h3>No mapped competitions</h3>
          <p>Available competitions with valid locations will appear here.</p>
        </div>
      ) : null}
      {selected && (
        <article className={`${workspace.panel} ${styles.selected}`}>
          <h3>{selected.name}</h3>
          <p>{selected.gym?.name ?? "Gym unavailable"}</p>
          <p>{selected.location}</p>
          <time dateTime={selected.date}>
            {formatCalendarDate(selected.date)}
          </time>
          <Link
            className={workspace.primary}
            to={eventDetailsPath(selected._id, detailsSearch)}
          >
            View event details
          </Link>
        </article>
      )}
    </section>
  );
}
