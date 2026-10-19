import type {
  AdvancedMarker,
  GoogleMap,
  MarkerLibrary,
} from "../../lib/googleMaps.ts";
import { pinTitle, type MapPlace } from "./mapPlaces.ts";
import styles from "./MapPin.module.css";

/** Every pin gets a z-index, since Google draws a mix of set and unset ones unpredictably. */
const PIN_Z_INDEX = 0;
const SELECTED_Z_INDEX = 1;

/** The pins of a Competition Map View, one per place, kept in step with the results. */
export interface PinLayer {
  /** Shows exactly these places, adding, updating and removing pins as needed. */
  show(places: MapPlace[]): void;
  /** Marks the pin of the selected place, or no pin. */
  select(placeId: string | null): void;
  /**
   * Moves keyboard focus back to a place's pin.
   *
   * @returns Whether the pin took focus.
   */
  focus(placeId: string): boolean;
  /** Takes every pin off the map. */
  clear(): void;
}

/** What the map does when a pin is used. */
export interface PinHandlers {
  /** A pin was selected with a click, a tap, or Enter. */
  onSelect: (place: MapPlace) => void;
  /** A pin received keyboard focus. */
  onFocus?: (place: MapPlace) => void;
}

interface Pin {
  marker: AdvancedMarker;
  content: HTMLElement;
  count: number;
}

/**
 * The pin's look: TopSend yellow with a dark outline, and the number of competitions when the
 * place has more than one. Screen readers get the marker's title instead.
 */
function pinContent(place: MapPlace): HTMLElement {
  const pin = document.createElement("div");
  pin.className = styles.pin;
  pin.setAttribute("aria-hidden", "true");

  const head = document.createElement("span");
  head.className = styles.head;
  if (place.competitions.length > 1) {
    head.textContent = String(place.competitions.length);
  } else {
    const dot = document.createElement("span");
    dot.className = styles.dot;
    head.append(dot);
  }

  const tail = document.createElement("span");
  tail.className = styles.tail;
  pin.append(head, tail);
  return pin;
}

/**
 * Creates the pins for a map (US-027 criteria 3 and 4). Each pin is a clickable Advanced Marker
 * titled with its place, so it can be reached with the keyboard and is read by screen readers.
 *
 * @param map The map to put the pins on.
 * @param library Google's marker library.
 * @param handlers Called when a pin is selected or focused.
 * @returns The pin layer.
 */
export function createPinLayer(
  map: GoogleMap,
  library: MarkerLibrary,
  handlers: PinHandlers,
): PinLayer {
  const pins = new Map<string, Pin>();
  const places = new Map<string, MapPlace>();
  let selectedId: string | null = null;

  function mark(placeId: string, pin: Pin) {
    const selected = placeId === selectedId;
    pin.content.dataset.selected = String(selected);
    pin.marker.zIndex = selected ? SELECTED_Z_INDEX : PIN_Z_INDEX;
  }

  function notify(placeId: string, handler: ((place: MapPlace) => void) | undefined) {
    const place = places.get(placeId);
    if (place) handler?.(place);
  }

  return {
    show(next) {
      const ids = new Set(next.map((place) => place.id));
      for (const [id, pin] of pins) {
        if (ids.has(id)) continue;
        pin.marker.map = null;
        pins.delete(id);
        places.delete(id);
      }

      for (const place of next) {
        places.set(place.id, place);
        const count = place.competitions.length;
        const existing = pins.get(place.id);
        if (existing) {
          if (existing.count !== count) {
            existing.content = pinContent(place);
            existing.marker.content = existing.content;
            existing.count = count;
          }
          existing.marker.title = pinTitle(place);
          mark(place.id, existing);
          continue;
        }

        const content = pinContent(place);
        const marker = new library.AdvancedMarkerElement({
          map,
          position: place.position,
          title: pinTitle(place),
          content,
          gmpClickable: true,
          zIndex: PIN_Z_INDEX,
        });
        marker.addEventListener("gmp-click", () => notify(place.id, handlers.onSelect));
        marker.addEventListener("focusin", () => notify(place.id, handlers.onFocus));
        const pin = { marker, content, count };
        pins.set(place.id, pin);
        mark(place.id, pin);
      }
    },

    select(placeId) {
      selectedId = placeId;
      for (const [id, pin] of pins) mark(id, pin);
    },

    focus(placeId) {
      const marker = pins.get(placeId)?.marker;
      if (!(marker instanceof HTMLElement)) return false;
      marker.focus({ preventScroll: true });
      return marker.contains(document.activeElement);
    },

    clear() {
      for (const { marker } of pins.values()) marker.map = null;
      pins.clear();
      places.clear();
    },
  };
}
