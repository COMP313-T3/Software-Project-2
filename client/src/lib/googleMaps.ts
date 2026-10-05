const ONLOAD_CALLBACK = "topsendMapsReady";

/** Browser key for Google Maps. Without one, the address is typed by hand. */
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

/**
 * Map ID for the location picker. Google's DEMO_MAP_ID works for development and with the
 * Maps Demo Key; a regular key needs a Map ID made in the Google Cloud project.
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

interface PlacesLibrary {
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

export interface GoogleMap {
  addListener(event: "click", handler: (event: MapClickEvent) => void): void;
  panTo(position: LatLngLiteral): void;
  setZoom(zoom: number): void;
}

export interface MapsLibrary {
  Map: new (
    element: HTMLElement,
    options: {
      center: LatLngLiteral;
      zoom: number;
      mapId: string;
      colorScheme?: string;
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
      clickableIcons?: boolean;
      gestureHandling?: string;
    },
  ) => GoogleMap;
}

export interface DraggableMarker extends EventTarget {
  position: LatLng | LatLngLiteral | null | undefined;
}

export interface MarkerLibrary {
  AdvancedMarkerElement: new (options: {
    map: GoogleMap;
    position: LatLngLiteral;
    gmpDraggable: boolean;
    title: string;
  }) => DraggableMarker;
}

export interface CoreLibrary {
  ColorScheme: { DARK: string };
}

interface LibraryMap {
  places: PlacesLibrary;
  maps: MapsLibrary;
  marker: MarkerLibrary;
  core: CoreLibrary;
}

interface GoogleMapsApi {
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

let loading: Promise<GoogleMapsApi> | null = null;

/**
 * Loads the Google Maps script once. It rejects when there is no key, the script can't load,
 * or Google refuses the key, and the next call tries again.
 *
 * @returns Google's Maps API, ready for importLibrary.
 */
export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("No Google Maps key is set."));
  }

  loading ??= new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (message: string) => {
      loading = null;
      script.remove();
      reject(new Error(message));
    };

    window[ONLOAD_CALLBACK] = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else fail("Google Maps loaded without its API.");
    };
    window.gm_authFailure = () => fail("Google Maps refused the key.");

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      v: "weekly",
      loading: "async",
      language: "en",
      region: "CA",
      callback: ONLOAD_CALLBACK,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => fail("The Google Maps script failed to load.");
    document.head.append(script);
  });
  return loading;
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
