import type {
  AdvancedMarker,
  GoogleMap,
  GoogleMapsApi,
  LatLngBoundsLiteral,
  LatLngLiteral,
  LibraryMap,
  MapPadding,
  MapsLibrary,
  MarkerLibrary,
} from "../lib/googleMaps.ts";

type MapOptions = ConstructorParameters<MapsLibrary["Map"]>[1];
type MarkerOptions = ConstructorParameters<MarkerLibrary["AdvancedMarkerElement"]>[0];

export interface FakeMap extends GoogleMap {
  element: HTMLElement;
  options: MapOptions;
  center: LatLngLiteral;
  zoom: number;
  fitted: { bounds: LatLngBoundsLiteral; padding?: number | MapPadding }[];
  revealed: { bounds: LatLngBoundsLiteral; padding?: number | MapPadding }[];
  panned: LatLngLiteral[];
}

let recordMap: ((map: StubMap) => void) | null = null;
let recordMarker: ((marker: StubMarker) => void) | null = null;

class StubMap implements FakeMap {
  element: HTMLElement;
  options: MapOptions;
  center: LatLngLiteral;
  zoom: number;
  fitted: { bounds: LatLngBoundsLiteral; padding?: number | MapPadding }[] = [];
  revealed: { bounds: LatLngBoundsLiteral; padding?: number | MapPadding }[] = [];
  panned: LatLngLiteral[] = [];

  constructor(element: HTMLElement, options: MapOptions) {
    this.element = element;
    this.options = options;
    this.center = options.center;
    this.zoom = options.zoom;
    recordMap?.(this);
  }

  addListener() {}

  fitBounds(bounds: LatLngBoundsLiteral, padding?: number | MapPadding) {
    this.fitted.push({ bounds, padding });
  }

  panTo(position: LatLngLiteral) {
    this.center = position;
    this.panned.push(position);
  }

  panToBounds(bounds: LatLngBoundsLiteral, padding?: number | MapPadding) {
    this.revealed.push({ bounds, padding });
  }

  setZoom(zoom: number) {
    this.zoom = zoom;
  }
}

/**
 * Like Google's AdvancedMarkerElement, an element on the page: it sits inside its map's element,
 * a clickable one can take keyboard focus, and it reports clicks as gmp-click events.
 */
export class StubMarker extends HTMLElement implements AdvancedMarker {
  options: MarkerOptions;
  position: LatLngLiteral;
  zIndex: number | null;
  gmpClickable: boolean;
  private shownOn: StubMap | null = null;
  private shown: Node | null = null;

  constructor(options: MarkerOptions) {
    super();
    this.options = options;
    this.position = options.position;
    this.title = options.title;
    this.zIndex = options.zIndex ?? null;
    this.gmpClickable = options.gmpClickable ?? false;
    if (this.gmpClickable) this.tabIndex = 0;
    this.content = options.content ?? null;
    this.map = options.map;
    recordMarker?.(this);
  }

  get content(): Node | null {
    return this.shown;
  }

  set content(node: Node | null) {
    this.shown = node;
    this.replaceChildren(...(node ? [node] : []));
  }

  get map(): GoogleMap | null {
    return this.shownOn;
  }

  set map(map: GoogleMap | null) {
    this.shownOn = map instanceof StubMap ? map : null;
    if (this.shownOn) this.shownOn.element.append(this);
    else this.remove();
  }

  /** Clicks the pin the way Google reports it, with a gmp-click event. */
  clickPin() {
    this.dispatchEvent(new Event("gmp-click"));
  }
}

if (!customElements.get("stub-advanced-marker")) {
  customElements.define("stub-advanced-marker", StubMarker);
}

/**
 * A stand-in for Google's Maps API in tests: maps and Advanced Markers that record what they're
 * asked to do, so tests can check them without loading Google's script.
 *
 * @returns The API to hand to code under test, and every map and marker it made since.
 */
export function fakeGoogleMaps() {
  const maps: FakeMap[] = [];
  const markers: StubMarker[] = [];
  recordMap = (map) => maps.push(map);
  recordMarker = (marker) => markers.push(marker);

  const libraries: LibraryMap = {
    places: {
      AutocompleteSessionToken: class {},
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: async () => ({ suggestions: [] }),
      },
    },
    maps: { Map: StubMap },
    marker: { AdvancedMarkerElement: StubMarker },
    core: {
      ColorScheme: { DARK: "DARK" },
      ControlPosition: { INLINE_END_BLOCK_START: 23 },
    },
  };
  const api: GoogleMapsApi = {
    importLibrary: async (name) => libraries[name],
  };

  return {
    api,
    maps,
    markers,
    /** The markers still on a map, which are the pins a person would see. */
    shownMarkers: () => markers.filter((marker) => marker.map !== null),
  };
}
