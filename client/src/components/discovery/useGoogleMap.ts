import { useEffect, useRef, useState, type RefObject } from "react";
import {
  GOOGLE_MAP_ID,
  GoogleMapsLoadError,
  loadGoogleMaps,
  onGoogleMapsKeyRefused,
  withinLoadTime,
  type GoogleMap,
  type LatLngBoundsLiteral,
  type LatLngLiteral,
} from "../../lib/googleMaps.ts";
import { createPinLayer, type PinHandlers, type PinLayer } from "./mapPins.ts";
import type { MapPlace } from "./mapPlaces.ts";

/** Where the map starts, and where it goes back to when nothing matches. TopSend is for Toronto gyms. */
const TORONTO: LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
const CITY_ZOOM = 11;

/** The smallest area the map zooms in to, in degrees, so a single gym still shows its streets. */
const MIN_SPAN_DEGREES = 0.02;

/** Pixels kept between the outermost pins and the edges of the map. */
const FIT_PADDING = 56;

/** Room above a pin's point for the pin itself, and room kept along the other edges, in pixels. */
const PIN_ROOM = 48;
const EDGE_ROOM = 16;

/** A card at least this share of the map's width spans its bottom, as on phones. */
const ACROSS_MAP = 0.6;

export type MapStatus = "loading" | "ready" | "failed";

/** A ready map and the pins on it. */
export interface MapLayer {
  map: GoogleMap;
  pins: PinLayer;
}

interface Built {
  attempt: number;
  layer: MapLayer | null;
  retryable: boolean;
}

/** Trying again can't help without a key or once Google has refused it. */
function retryable(error: unknown): boolean {
  return !(
    error instanceof GoogleMapsLoadError &&
    (error.reason === "no-key" || error.reason === "refused")
  );
}

async function loadLibraries() {
  const maps = await loadGoogleMaps();
  return Promise.all([
    maps.importLibrary("maps"),
    maps.importLibrary("marker"),
    maps.importLibrary("core"),
  ]);
}

function widen(low: number, high: number): [number, number] {
  const extra = Math.max(0, MIN_SPAN_DEGREES - (high - low)) / 2;
  return [low - extra, high + extra];
}

/**
 * The area that holds every place, widened to at least MIN_SPAN_DEGREES each way.
 *
 * @param places At least one place.
 * @returns The bounds to fit the map to.
 */
export function boundsAround(places: MapPlace[]): LatLngBoundsLiteral {
  const lats = places.map(({ position }) => position.lat);
  const lngs = places.map(({ position }) => position.lng);
  const [south, north] = widen(Math.min(...lats), Math.max(...lats));
  const [west, east] = widen(Math.min(...lngs), Math.max(...lngs));
  return { north, south, east, west };
}

/**
 * Moves the map so every pin shows, or back to Toronto when there are none.
 *
 * @param map The map.
 * @param places The places that have pins.
 */
export function fitToPlaces(map: GoogleMap, places: MapPlace[]): void {
  if (places.length === 0) {
    map.panTo(TORONTO);
    map.setZoom(CITY_ZOOM);
    return;
  }
  map.fitBounds(boundsAround(places), FIT_PADDING);
}

/**
 * Pans the map just enough that the selected pin isn't hidden by its card. A card that spans the
 * bottom of the map, as on phones, keeps the pin above it; a card at the left keeps the pin to
 * its right. A pin that's already clear of the card doesn't move.
 *
 * @param map The map.
 * @param place The selected place.
 * @param frame Where the map is on the page.
 * @param card Where the selected place's card is on the page.
 */
export function revealPlace(
  map: GoogleMap,
  place: MapPlace,
  frame: DOMRect,
  card: DOMRect,
): void {
  const { lat, lng } = place.position;
  const acrossMap = card.width >= frame.width * ACROSS_MAP;
  map.panToBounds(
    { north: lat, south: lat, east: lng, west: lng },
    acrossMap
      ? {
          top: PIN_ROOM,
          right: EDGE_ROOM,
          bottom: Math.max(EDGE_ROOM, frame.bottom - card.top + EDGE_ROOM),
          left: EDGE_ROOM,
        }
      : {
          top: PIN_ROOM,
          right: EDGE_ROOM,
          bottom: EDGE_ROOM,
          left: Math.max(EDGE_ROOM, card.right - frame.left + EDGE_ROOM),
        },
  );
}

/**
 * Builds the Google map of the Competition Map View in the element, with its pin layer (US-027
 * criteria 2 and 3). The map is made once and kept while the search changes, because every new
 * map counts as a map load against the key's quota. Loading the script and its libraries has 5
 * seconds in all (NR-003). The map fails when that runs out or Google refuses the key, even after
 * the map is showing.
 *
 * @param element The element the map fills. It has to stay mounted while the map is in use.
 * @param handlers Called when a pin is selected or focused. The latest ones are always used.
 * @returns The map's status, its layer once ready, and retry, which is null unless trying again
 *   could help.
 */
export function useGoogleMap(
  element: RefObject<HTMLDivElement | null>,
  handlers: PinHandlers,
) {
  const [attempt, setAttempt] = useState(0);
  const [built, setBuilt] = useState<Built>({
    attempt: -1,
    layer: null,
    retryable: true,
  });
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const container = element.current;
    if (!container) return;
    let active = true;
    let layer: MapLayer | null = null;

    const stopListening = onGoogleMapsKeyRefused(() => {
      if (active) setBuilt({ attempt, layer: null, retryable: false });
    });

    async function build(target: HTMLDivElement) {
      const [{ Map }, markers, { ControlPosition }] = await withinLoadTime(loadLibraries());
      if (!active) return;

      const map = new Map(target, {
        center: TORONTO,
        zoom: CITY_ZOOM,
        mapId: GOOGLE_MAP_ID,
        clickableIcons: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        cameraControlOptions: { position: ControlPosition.INLINE_END_BLOCK_START },
      });
      layer = {
        map,
        pins: createPinLayer(map, markers, {
          onSelect: (place) => latest.current.onSelect(place),
          onFocus: (place) => latest.current.onFocus?.(place),
        }),
      };
      setBuilt({ attempt, layer, retryable: true });
    }

    build(container).catch((error: unknown) => {
      if (!active) return;
      setBuilt((current) =>
        current.attempt === attempt && !current.retryable
          ? current
          : { attempt, layer: null, retryable: retryable(error) },
      );
    });

    return () => {
      active = false;
      stopListening();
      layer?.pins.clear();
      container.replaceChildren();
    };
  }, [attempt, element]);

  const status: MapStatus =
    built.attempt !== attempt ? "loading" : built.layer ? "ready" : "failed";
  return {
    status,
    layer: status === "ready" ? built.layer : null,
    retry:
      status === "failed" && built.retryable
        ? () => setAttempt((value) => value + 1)
        : null,
  };
}
