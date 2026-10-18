import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompetitionMap from "./CompetitionMap.tsx";
import {
  EMPTY_DISCOVERY_FILTERS,
  getCompetitionMap,
  type CompetitionMapResults,
} from "../../lib/discoveryApi.ts";
import {
  loadGoogleMaps,
  type DraggableMarker,
  type GoogleMap,
  type GoogleMapsApi,
  type LatLngLiteral,
  type LibraryMap,
  type MarkerLibrary,
  type MapsLibrary,
} from "../../lib/googleMaps.ts";

vi.mock("../../lib/discoveryApi.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/discoveryApi.ts")>(),
  getCompetitionMap: vi.fn(),
}));
vi.mock("../../lib/googleMaps.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/googleMaps.ts")>(),
  loadGoogleMaps: vi.fn(),
}));

const competition = {
  _id: "507f1f77bcf86cd799439012",
  name: "Autumn Open",
  date: "2026-11-14",
  location: "Toronto",
  gym: { _id: "507f1f77bcf86cd799439011", name: "North Gym" },
  registrationStatus: "OPEN" as const,
  capacity: 80,
  spacesLeft: 80,
  full: false,
  coordinates: { lat: 43.6532, lng: -79.3832 },
};

const markers: FakeMarker[] = [];
let mapOptions: ConstructorParameters<MapsLibrary["Map"]>[1] | undefined;

class FakeMap implements GoogleMap {
  constructor(
    _element: HTMLElement,
    options: ConstructorParameters<MapsLibrary["Map"]>[1],
  ) {
    mapOptions = options;
  }

  addListener(
    _event: "click",
    _handler: Parameters<GoogleMap["addListener"]>[1],
  ) {}

  panTo(_position: LatLngLiteral) {}
  setZoom(_zoom: number) {}
}

class FakeMarker extends EventTarget implements DraggableMarker {
  position: LatLngLiteral;
  map: GoogleMap | null;
  title: string;
  gmpClickable: boolean | undefined;

  constructor(
    options: ConstructorParameters<MarkerLibrary["AdvancedMarkerElement"]>[0],
  ) {
    super();
    this.position = options.position;
    this.map = options.map;
    this.title = options.title;
    this.gmpClickable = options.gmpClickable;
    markers.push(this);
  }
}

const libraries: LibraryMap = {
  places: {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: async () => ({ suggestions: [] }),
    },
  },
  maps: { Map: FakeMap },
  marker: { AdvancedMarkerElement: FakeMarker },
  core: { ColorScheme: { DARK: "dark" } },
};
const mapsApi: GoogleMapsApi = {
  importLibrary: async (name) => libraries[name],
};

const mapResults: CompetitionMapResults = {
  pins: [competition, { ...competition, _id: "invalid", coordinates: null }],
  total: 2,
  unmapped: 1,
  truncated: false,
};

function renderMap() {
  return render(
    <MemoryRouter initialEntries={["/competitions?view=map&q=Autumn"]}>
      <Routes>
        <Route
          path="*"
          element={
            <CompetitionMap
              filters={{ ...EMPTY_DISCOVERY_FILTERS, q: "Autumn" }}
              search="q=Autumn&view=map"
              refreshRevision={0}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  markers.length = 0;
  mapOptions = undefined;
  vi.mocked(getCompetitionMap).mockReset().mockResolvedValue(mapResults);
  vi.mocked(loadGoogleMaps).mockReset().mockResolvedValue(mapsApi);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-027 Competition Map View", () => {
  it("displays available map pins, selected event details and its details link", async () => {
    renderMap();
    await screen.findByRole("region", { name: "Competition map" });
    await waitFor(() => expect(markers).toHaveLength(1));

    expect(mapOptions?.mapId).toBe("DEMO_MAP_ID");
    expect(markers[0].title).toBe("Autumn Open at North Gym");
    expect(markers[0].gmpClickable).toBe(true);
    expect(screen.getByText(/1 competition doesn't have a valid map location/)).toBeTruthy();

    act(() => {
      markers[0].dispatchEvent(new Event("gmp-click"));
    });
    expect(screen.getByRole("heading", { name: "Autumn Open" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View event details" }).getAttribute("href"))
      .toBe("/competitions/507f1f77bcf86cd799439012?q=Autumn");
  });

  it("shows a clear Google Maps failure and preserves the list view", async () => {
    vi.mocked(loadGoogleMaps).mockRejectedValue(new Error("private key detail"));
    renderMap();

    expect(
      await screen.findByText(
        "Google Maps couldn't load. You can still use the competition list.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open competition list" }).getAttribute("href"))
      .toBe("/competitions?q=Autumn");
    expect(screen.queryByText("private key detail")).toBeNull();
  });
});
