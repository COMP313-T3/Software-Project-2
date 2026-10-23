const ONLOAD_CALLBACK = "topsendMapsReady";
const LOAD_TIMEOUT_MS = 5000;

/**
 * Browser key for Google Maps. Without one, the address at sign-up is typed by hand and the
 * Competition Map View says the map can't load.
 */
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

/**
 * Map ID for the location picker and the Competition Map View. Google's DEMO_MAP_ID works for
 * development and with the Maps Demo Key; a regular key needs a Map ID made in the Google Cloud
 * project.
 */
export const GOOGLE_MAP_ID =
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface LatLng {
  lat(): number;
  lng(): number;
}

interface FormattableText {
  text: string;
}

export interface PlacePrediction {
  placeId: string;
  text: FormattableText;
  mainText: FormattableText | null;
  secondaryText: FormattableText | null;
}

export interface PlacesLibrary {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      sessionToken: object;
      language?: string;
      region?: string;
    }): Promise<{
      suggestions: { placePrediction: PlacePrediction | null }[];
    }>;
  };
}

interface MapClickEvent {
  latLng: LatLng | null;
}

export interface LatLngBoundsLiteral {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Space in pixels kept clear along each edge of the map. */
export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GoogleMap {
  addListener(event: "click", handler: (event: MapClickEvent) => void): void;
  fitBounds(bounds: LatLngBoundsLiteral, padding?: number | MapPadding): void;
  panTo(position: LatLngLiteral): void;
  panToBounds(bounds: LatLngBoundsLiteral, padding?: number | MapPadding): void;
  setZoom(zoom: number): void;
}

/** A circle Google draws on a map, such as the distance around a starting point. */
export interface MapCircle {
  setMap(map: GoogleMap | null): void;
  setCenter(center: LatLngLiteral): void;
  setRadius(meters: number): void;
}

export interface CircleOptions {
  map: GoogleMap;
  center: LatLngLiteral;
  /** In metres. */
  radius: number;
  clickable?: boolean;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillColor?: string;
  fillOpacity?: number;
}

export interface MapsLibrary {
  Circle: new (options: CircleOptions) => MapCircle;
  Map: new (
    element: HTMLElement,
    options: {
      center: LatLngLiteral;
      zoom: number;
      mapId: string;
      colorScheme?: string;
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      cameraControlOptions?: { position?: number };
      clickableIcons?: boolean;
      gestureHandling?: string;
    },
  ) => GoogleMap;
}

export interface AdvancedMarker extends EventTarget {
  position: LatLng | LatLngLiteral | null | undefined;
  map: GoogleMap | null;
  title: string;
  content?: Node | null;
  zIndex?: number | null;
}

export interface MarkerLibrary {
  AdvancedMarkerElement: new (options: {
    map: GoogleMap;
    position: LatLngLiteral;
    title: string;
    content?: HTMLElement;
    gmpDraggable?: boolean;
    gmpClickable?: boolean;
    zIndex?: number;
  }) => AdvancedMarker;
}

export interface CoreLibrary {
  ColorScheme: { DARK: string };
  ControlPosition: { INLINE_END_BLOCK_START: number };
}

export interface LibraryMap {
  places: PlacesLibrary;
  maps: MapsLibrary;
  marker: MarkerLibrary;
  core: CoreLibrary;
}

export interface GoogleMapsApi {
  importLibrary<Name extends keyof LibraryMap>(
    name: Name,
  ): Promise<LibraryMap[Name]>;
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
    [ONLOAD_CALLBACK]?: () => void;
    gm_authFailure?: () => void;
  }
}

/**
 * Why Google Maps couldn't load. Trying again can help after "timeout" or "script", but not
 * without a key or once Google has refused it.
 */
export type GoogleMapsFailure = "no-key" | "refused" | "timeout" | "script";

/** A failure to load Google Maps, with its reason. */
export class GoogleMapsLoadError extends Error {
  readonly reason: GoogleMapsFailure;

  constructor(reason: GoogleMapsFailure, message: string) {
    super(message);
    this.name = "GoogleMapsLoadError";
    this.reason = reason;
  }
}

let script: Promise<GoogleMapsApi> | null = null;
let loading: Promise<GoogleMapsApi> | null = null;
let keyRefused = false;
let failRequest: ((error: GoogleMapsLoadError) => void) | null = null;
const keyRefusedListeners = new Set<() => void>();

function refusedError() {
  return new GoogleMapsLoadError("refused", "Google Maps refused the key.");
}

/**
 * Google calls this when it refuses the key, which can happen after the script has loaded and a
 * map is showing. The refusal lasts until the page reloads, since the key can't change before.
 */
function refuseKey() {
  keyRefused = true;
  loading = null;
  failRequest?.(refusedError());
  keyRefusedListeners.forEach((listener) => listener());
}

function requestScript(): Promise<GoogleMapsApi> {
  const request = new Promise<GoogleMapsApi>((resolve, reject) => {
    const element = document.createElement("script");
    const fail = (error: GoogleMapsLoadError) => {
      if (script === request) script = null;
      if (failRequest === fail) failRequest = null;
      element.remove();
      reject(error);
    };
    failRequest = fail;

    window[ONLOAD_CALLBACK] = () => {
      if (failRequest === fail) failRequest = null;
      if (window.google?.maps) resolve(window.google.maps);
      else fail(new GoogleMapsLoadError("script", "Google Maps loaded without its API."));
    };

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      v: "weekly",
      loading: "async",
      language: "en",
      region: "CA",
      callback: ONLOAD_CALLBACK,
    });
    element.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    element.async = true;
    element.onerror = () =>
      fail(new GoogleMapsLoadError("script", "The Google Maps script failed to load."));
    document.head.append(element);
  });
  return request;
}

/**
 * Waits for one step of showing a map, and fails like a slow script does when the step takes
 * longer than 5 seconds (NR-003).
 *
 * @param step The step, such as loading the script or one of its libraries.
 * @returns What the step gives, if it finishes in time.
 * @throws {GoogleMapsLoadError} With the reason "timeout" when time runs out first.
 */
export function withinLoadTime<T>(step: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new GoogleMapsLoadError("timeout", "Google Maps took too long to load.")),
      LOAD_TIMEOUT_MS,
    );
    step.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/**
 * Loads the Google Maps script once. It rejects with a GoogleMapsLoadError when there is no key,
 * the script fails, Google refuses the key, or the script isn't ready within 5 seconds (NR-003).
 * Callers that come while a load is under way share its 5 seconds. A script still on its way
 * when time runs out keeps loading, and the next call waits for that same script, so Google's
 * script is never added to the page twice. Once Google refuses the key, every call rejects
 * until the page reloads.
 *
 * @returns Google's Maps API, ready for importLibrary.
 */
export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new GoogleMapsLoadError("no-key", "No Google Maps key is set."));
  }
  if (keyRefused) return Promise.reject(refusedError());
  window.gm_authFailure = refuseKey;
  if (loading) return loading;

  script ??= window.google?.maps
    ? Promise.resolve(window.google.maps)
    : requestScript();
  const attempt = withinLoadTime(script);
  loading = attempt;
  attempt.catch(() => {
    if (loading === attempt) loading = null;
  });
  return attempt;
}

/**
 * Calls the listener when Google refuses the Maps key. Google can do that after the script has
 * loaded and a map is already showing, so a page uses this to replace the broken map with its
 * own message.
 *
 * @param listener Called each time Google reports the refusal.
 * @returns A function that stops the calls.
 */
export function onGoogleMapsKeyRefused(listener: () => void): () => void {
  keyRefusedListeners.add(listener);
  return () => {
    keyRefusedListeners.delete(listener);
  };
}

/**
 * Asks Google for address suggestions as someone types.
 *
 * @param input What has been typed so far.
 * @param sessionToken Groups one person's typing into a single session for Google's billing.
 * @returns Up to five suggestions.
 */
export async function suggestAddresses(
  input: string,
  sessionToken: object,
): Promise<PlacePrediction[]> {
  const maps = await loadGoogleMaps();
  const { AutocompleteSuggestion } = await maps.importLibrary("places");
  const { suggestions } =
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken,
      language: "en",
      region: "ca",
    });
  return suggestions
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is PlacePrediction => prediction !== null)
    .slice(0, 5);
}

/**
 * Starts a new suggestion session, used for one address search.
 *
 * @returns The session token.
 */
export async function newSuggestionSession(): Promise<object> {
  const maps = await loadGoogleMaps();
  const { AutocompleteSessionToken } = await maps.importLibrary("places");
  return new AutocompleteSessionToken();
}

/**
 * Reads a position from a map click or a dragged marker, whichever form Google gives it in.
 *
 * @param position A LatLng object or a plain { lat, lng }.
 * @returns A plain { lat, lng }, or null when there is no position.
 */
export function toLatLngLiteral(
  position: LatLng | LatLngLiteral | null | undefined,
): LatLngLiteral | null {
  if (!position) return null;
  return typeof position.lat === "function"
    ? { lat: position.lat(), lng: (position as LatLng).lng() }
    : (position as LatLngLiteral);
}
