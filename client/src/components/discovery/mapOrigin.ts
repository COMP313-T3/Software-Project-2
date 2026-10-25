import type {
  AdvancedMarker,
  GoogleMap,
  LatLngLiteral,
  MapCircle,
  MapsLibrary,
  MarkerLibrary,
} from "../../lib/googleMaps.ts";
import styles from "./MapPin.module.css";

/** The starting point on the map, and how far around it the search reaches (US-027 criterion 7). */
export interface OriginMark {
  position: LatLngLiteral;
  /** The chosen distance in kilometres, or null for any distance. */
  radiusKm: number | null;
  /** The marker's accessible name and tooltip, like "Your current location". */
  title: string;
}

/** The starting point's marker and circle, kept in step with the search. */
export interface OriginLayer {
  /** Shows this starting point and its distance, or takes them off the map for null. */
  show(origin: OriginMark | null): void;
  /** Takes the marker and circle off the map. */
  clear(): void;
}

/** Below the competition pins, so a gym right at the starting point can still be selected. */
const ORIGIN_Z_INDEX = -1;

/** Google draws the circle itself, so it takes TopSend's night and summit colours as values. */
const CIRCLE_LOOK = {
  strokeColor: "#17110d",
  strokeOpacity: 0.7,
  strokeWeight: 2,
  fillColor: "#fdc914",
  fillOpacity: 0.12,
};

function originContent(): HTMLElement {
  const dot = document.createElement("div");
  dot.className = styles.origin;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

/**
 * Creates the starting point's layer for a map: a dark dot with a white ring where the search
 * starts, and, for a chosen distance, a circle of that radius around it. Neither can be selected.
 *
 * @param map The map to draw on.
 * @param markers Google's marker library.
 * @param Circle Google's circle, from the maps library.
 * @returns The layer.
 */
export function createOriginLayer(
  map: GoogleMap,
  markers: MarkerLibrary,
  Circle: MapsLibrary["Circle"],
): OriginLayer {
  let marker: AdvancedMarker | null = null;
  let circle: MapCircle | null = null;

  function clear() {
    if (marker) marker.map = null;
    circle?.setMap(null);
    marker = null;
    circle = null;
  }

  return {
    show(origin) {
      if (!origin) {
        clear();
        return;
      }
      if (marker) {
        marker.position = origin.position;
        marker.title = origin.title;
      } else {
        marker = new markers.AdvancedMarkerElement({
          map,
          position: origin.position,
          title: origin.title,
          content: originContent(),
          zIndex: ORIGIN_Z_INDEX,
        });
      }

      if (origin.radiusKm === null) {
        circle?.setMap(null);
        circle = null;
        return;
      }
      const radius = origin.radiusKm * 1000;
      if (circle) {
        circle.setCenter(origin.position);
        circle.setRadius(radius);
      } else {
        circle = new Circle({ map, center: origin.position, radius, clickable: false, ...CIRCLE_LOOK });
      }
    },
    clear,
  };
}
