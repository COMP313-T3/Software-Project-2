import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import {
  EMPTY_DISCOVERY_FILTERS,
  getCompetitionMap,
  type CompetitionMapResults,
  type DiscoveredCompetition,
  type DiscoveryFilters,
} from "../../lib/discoveryApi.ts";
import {
  GoogleMapsLoadError,
  loadGoogleMaps,
  onGoogleMapsKeyRefused,
  type GoogleMapsApi,
} from "../../lib/googleMaps.ts";
import { fakeGoogleMaps } from "../../test/fakeGoogleMaps.ts";
import CompetitionMap from "./CompetitionMap.tsx";

vi.mock("../../lib/discoveryApi.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/discoveryApi.ts")>()),
  getCompetitionMap: vi.fn(),
}));
vi.mock("../../lib/googleMaps.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/googleMaps.ts")>()),
  loadGoogleMaps: vi.fn(),
  onGoogleMapsKeyRefused: vi.fn(),
}));

const NORTHSIDE = { lat: 43.6532, lng: -79.3832 };
const LAKESHORE = { lat: 43.5891, lng: -79.6441 };
const MAP_ERROR = "Google Maps couldn't load. You can still use the competition list.";

function competition(
  id: string,
  name: string,
  coordinates: DiscoveredCompetition["coordinates"],
  gymName = "Northside Climbing",
): DiscoveredCompetition {
  return {
    _id: id,
    name,
    date: "2026-11-14",
    location: "Toronto",
    gym: { _id: `gym-${gymName}`, name: gymName },
    registrationStatus: "OPEN",
    capacity: 80,
    spacesLeft: 80,
    full: false,
    coordinates,
  };
}

const autumnOpen = competition("507f1f77bcf86cd799439012", "Autumn Open", NORTHSIDE);
const winterOpen = competition("507f1f77bcf86cd799439013", "Winter Open", NORTHSIDE);
const lakeshoreJam = competition(
  "507f1f77bcf86cd799439014",
  "Lakeshore Jam",
  LAKESHORE,
  "Lakeshore Boulders",
);

/** Fresh objects on every call, as the API sends them. */
function answer(pins: DiscoveredCompetition[], extra: Partial<CompetitionMapResults> = {}) {
  return async (): Promise<CompetitionMapResults> => ({
    pins: pins.map((pin) => ({ ...pin, coordinates: pin.coordinates && { ...pin.coordinates } })),
    total: pins.length,
    unmapped: 0,
    truncated: false,
    ...extra,
  });
}

let google = fakeGoogleMaps();
let refuseKey: () => void = () => undefined;

interface MapProps {
  filters?: DiscoveryFilters;
  search?: string;
  refreshRevision?: number;
  onSummaryChange?: (summary: string) => void;
  onClearFilters?: () => void;
}

function mapWith(props: MapProps = {}) {
  return (
    <MemoryRouter>
      <CompetitionMap
        filters={props.filters ?? { ...EMPTY_DISCOVERY_FILTERS, q: "Open" }}
        search={props.search ?? "q=Open&view=map"}
        refreshRevision={props.refreshRevision ?? 0}
        onSummaryChange={props.onSummaryChange}
        onClearFilters={props.onClearFilters}
      />
    </MemoryRouter>
  );
}

function searchFor(q: string) {
  return mapWith({ filters: { ...EMPTY_DISCOVERY_FILTERS, q }, search: `q=${q}&view=map` });
}

async function pinsShown(count: number) {
  await waitFor(() => expect(google.shownMarkers()).toHaveLength(count));
  return google.shownMarkers();
}

function mapRegion() {
  return screen.getByRole("region", { name: "Competition map" });
}

beforeEach(() => {
  google = fakeGoogleMaps();
  vi.mocked(loadGoogleMaps).mockReset().mockResolvedValue(google.api);
  vi.mocked(onGoogleMapsKeyRefused)
    .mockReset()
    .mockImplementation((listener) => {
      refuseKey = listener;
      return () => {
        refuseKey = () => undefined;
      };
    });
  vi.mocked(getCompetitionMap)
    .mockReset()
    .mockImplementation(answer([autumnOpen, winterOpen, lakeshoreJam]));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("US-027 Competition Map View", () => {
  it("shows a Google map of Toronto made with the configured map ID (criterion 2)", async () => {
    render(mapWith());

    await waitFor(() => expect(google.maps).toHaveLength(1));
    expect(google.maps[0].options).toMatchObject({
      center: { lat: 43.6532, lng: -79.3832 },
      zoom: 11,
      mapId: "DEMO_MAP_ID",
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      cameraControlOptions: { position: 23 },
    });
    expect(google.maps[0].options).not.toHaveProperty("gestureHandling");
  });

  it("makes one map in Strict Mode, which mounts it twice in development", async () => {
    render(<StrictMode>{mapWith()}</StrictMode>);

    await pinsShown(2);
    expect(google.maps).toHaveLength(1);
  });

  it("loads the pins for the current search and fits the map around them (criterion 3)", async () => {
    render(mapWith());

    const pins = await pinsShown(2);
    expect(getCompetitionMap).toHaveBeenCalledWith(
      { ...EMPTY_DISCOVERY_FILTERS, q: "Open" },
      expect.any(AbortSignal),
    );
    expect(pins.map(({ title }) => title)).toEqual([
      "2 competitions at Northside Climbing",
      "Lakeshore Jam at Lakeshore Boulders",
    ]);
    const [{ bounds, padding }] = google.maps[0].fitted;
    expect(bounds.north).toBeGreaterThanOrEqual(NORTHSIDE.lat);
    expect(bounds.south).toBeLessThanOrEqual(LAKESHORE.lat);
    expect(bounds.east).toBeGreaterThanOrEqual(NORTHSIDE.lng);
    expect(bounds.west).toBeLessThanOrEqual(LAKESHORE.lng);
    expect(padding).toBeGreaterThan(0);
  });

  it("zooms to the neighbourhood of a single gym instead of its street corner", async () => {
    vi.mocked(getCompetitionMap).mockImplementation(answer([autumnOpen]));
    render(mapWith());

    await pinsShown(1);
    const [{ bounds }] = google.maps[0].fitted;
    expect(bounds.north - bounds.south).toBeCloseTo(0.02);
    expect(bounds.east - bounds.west).toBeCloseTo(0.02);
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(NORTHSIDE.lat);
  });

  it("shows the competitions at a selected pin, each linking to its Event Details page (criteria 4 to 6)", async () => {
    render(mapWith());
    const [northside] = await pinsShown(2);

    act(() => northside.clickPin());

    const card = await screen.findByRole("region", { name: "Northside Climbing" });
    expect(within(card).getByRole("heading", { name: "Autumn Open" })).toBeTruthy();
    expect(within(card).getByRole("heading", { name: "Winter Open" })).toBeTruthy();
    expect(
      within(card)
        .getByRole("link", { name: "View event details for Winter Open" })
        .getAttribute("href"),
    ).toBe(`/competitions/${winterOpen._id}?q=Open&view=map`);
    expect((northside.content as HTMLElement).dataset.selected).toBe("true");
    expect(google.maps[0].revealed.map(({ bounds }) => bounds)).toEqual([
      { north: NORTHSIDE.lat, south: NORTHSIDE.lat, east: NORTHSIDE.lng, west: NORTHSIDE.lng },
    ]);
  });

  it("keeps a focused pin clear of the open card", async () => {
    render(mapWith());
    const [northside, lakeshore] = await pinsShown(2);
    act(() => northside.clickPin());
    await screen.findByRole("region", { name: "Northside Climbing" });

    act(() => lakeshore.focus());

    expect(google.maps[0].revealed.map(({ bounds }) => bounds.north)).toEqual([
      NORTHSIDE.lat,
      LAKESHORE.lat,
    ]);
  });

  it("keeps the same map while the search changes, and moves it to the new pins", async () => {
    const { rerender } = render(mapWith());
    await pinsShown(2);
    vi.mocked(getCompetitionMap).mockImplementation(answer([lakeshoreJam]));

    rerender(searchFor("Lakeshore"));

    await pinsShown(1);
    expect(google.maps).toHaveLength(1);
    expect(google.shownMarkers()[0].title).toBe("Lakeshore Jam at Lakeshore Boulders");
    expect(getCompetitionMap).toHaveBeenLastCalledWith(
      { ...EMPTY_DISCOVERY_FILTERS, q: "Lakeshore" },
      expect.any(AbortSignal),
    );
    expect(google.maps[0].fitted).toHaveLength(2);
  });

  it("reloads on refresh without moving the map when the pins are the same", async () => {
    const { rerender } = render(mapWith());
    const [northside] = await pinsShown(2);
    act(() => northside.clickPin());
    await screen.findByRole("region", { name: "Northside Climbing" });

    rerender(mapWith({ refreshRevision: 1 }));

    await waitFor(() => expect(getCompetitionMap).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Loading competition locations…")).toBeNull());
    expect(screen.getByRole("region", { name: "Northside Climbing" })).toBeTruthy();
    expect(google.maps).toHaveLength(1);
    expect(google.maps[0].fitted).toHaveLength(1);
    expect(google.maps[0].revealed).toHaveLength(1);
  });

  it("closes the card for a new search, and doesn't bring it back on the way back", async () => {
    const { rerender } = render(mapWith());
    const [northside] = await pinsShown(2);
    act(() => northside.clickPin());
    await screen.findByRole("region", { name: "Northside Climbing" });

    rerender(searchFor("Winter"));
    expect(screen.queryByRole("region", { name: "Northside Climbing" })).toBeNull();
    await waitFor(() => expect(getCompetitionMap).toHaveBeenCalledTimes(2));

    rerender(mapWith());
    await waitFor(() => expect(getCompetitionMap).toHaveBeenCalledTimes(3));
    await pinsShown(2);
    expect(screen.queryByRole("region", { name: "Northside Climbing" })).toBeNull();
  });

  it("lets pins be selected while the same search refreshes", async () => {
    const { rerender } = render(mapWith());
    const [northside] = await pinsShown(2);
    vi.mocked(getCompetitionMap).mockReturnValue(new Promise(() => undefined));

    rerender(mapWith({ refreshRevision: 1 }));
    act(() => northside.clickPin());

    expect(await screen.findByRole("region", { name: "Northside Climbing" })).toBeTruthy();
  });

  it("ignores pins from the last results while new ones load", async () => {
    const { rerender } = render(mapWith());
    const [northside] = await pinsShown(2);
    vi.mocked(getCompetitionMap).mockReturnValue(new Promise(() => undefined));

    rerender(searchFor("Winter"));
    act(() => northside.clickPin());

    expect(screen.queryByRole("region", { name: "Northside Climbing" })).toBeNull();
  });

  it("moves focus to the map when new results take away the place whose card has focus", async () => {
    const { rerender } = render(mapWith());
    const [, lakeshore] = await pinsShown(2);
    act(() => lakeshore.clickPin());
    const card = await screen.findByRole("region", { name: "Lakeshore Boulders" });
    within(card).getByRole("link", { name: /Lakeshore Jam/ }).focus();
    vi.mocked(getCompetitionMap).mockImplementation(answer([autumnOpen, winterOpen]));

    rerender(mapWith({ refreshRevision: 1 }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Lakeshore Boulders" })).toBeNull(),
    );
    expect(document.activeElement).toBe(mapRegion());
  });

  it("closes the card with Close or Esc and returns focus to its pin", async () => {
    render(mapWith());
    const [northside, lakeshore] = await pinsShown(2);

    act(() => northside.clickPin());
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Northside Climbing" })).toBeNull();
    expect((northside.content as HTMLElement).dataset.selected).toBe("false");
    expect(document.activeElement).toBe(northside);

    act(() => lakeshore.clickPin());
    fireEvent.keyDown(await screen.findByRole("button", { name: "Close" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("region", { name: "Lakeshore Boulders" })).toBeNull();
    expect(document.activeElement).toBe(lakeshore);
    expect(google.maps[0].revealed.map(({ bounds }) => bounds.north)).toEqual([
      NORTHSIDE.lat,
      LAKESHORE.lat,
    ]);
  });

  it("says the map is loading until Google Maps is ready (NR-003)", async () => {
    let ready: (api: GoogleMapsApi) => void = () => undefined;
    vi.mocked(loadGoogleMaps).mockReturnValue(
      new Promise((resolve) => {
        ready = resolve;
      }),
    );
    render(mapWith());

    expect(screen.getByRole("status").textContent).toBe("Loading Google Maps…");

    await act(async () => ready(google.api));
    await pinsShown(2);
    expect(screen.queryByText("Loading Google Maps…")).toBeNull();
  });

  it("explains when Google Maps can't load, and keeps the list and Try again (AC-012)", async () => {
    vi.mocked(loadGoogleMaps).mockRejectedValueOnce(
      new GoogleMapsLoadError("timeout", "Google Maps took too long to load."),
    );
    render(mapWith());

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(MAP_ERROR)).toBeTruthy();
    expect(within(alert).queryByText(/too long/)).toBeNull();
    expect(
      within(alert).getByRole("link", { name: "Open competition list" }).getAttribute("href"),
    ).toBe("/competitions?q=Open");

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(document.activeElement).toBe(mapRegion());
    await pinsShown(2);
    expect(loadGoogleMaps).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("gives up after 5 seconds when Google's map libraries don't arrive", async () => {
    vi.useFakeTimers();
    vi.mocked(loadGoogleMaps).mockResolvedValue({
      importLibrary: () => new Promise(() => undefined),
    });
    render(mapWith());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(within(screen.getByRole("alert")).getByText(MAP_ERROR)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it.each([
    ["without a key", new GoogleMapsLoadError("no-key", "No Google Maps key is set.")],
    ["once Google has refused the key", new GoogleMapsLoadError("refused", "Google Maps refused the key.")],
  ])("doesn't offer Try again %s", async (_case, error) => {
    vi.mocked(loadGoogleMaps).mockRejectedValue(error);
    render(mapWith());

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(MAP_ERROR)).toBeTruthy();
    expect(within(alert).queryByRole("button", { name: "Try again" })).toBeNull();
    expect(within(alert).getByRole("link", { name: "Open competition list" })).toBeTruthy();
    expect(google.maps).toHaveLength(0);
  });

  it("replaces the map with its message when Google refuses the key after loading", async () => {
    render(mapWith());
    await pinsShown(2);

    act(() => refuseKey());

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(MAP_ERROR)).toBeTruthy();
    expect(within(alert).queryByRole("button", { name: "Try again" })).toBeNull();
    expect(within(alert).getByRole("link", { name: "Open competition list" })).toBeTruthy();
    expect(google.maps[0].element.hidden).toBe(true);
  });

  it("offers Try again when the pins can't be loaded, and keeps the map out of the way", async () => {
    vi.mocked(getCompetitionMap).mockRejectedValueOnce(
      new ApiError(503, "SERVICE_UNAVAILABLE", "Server details stay hidden."),
    );
    render(mapWith());

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "Couldn't load competition locations" }),
    ).toBeTruthy();
    expect(within(alert).getByText("Please try again.")).toBeTruthy();
    await waitFor(() => expect(google.maps).toHaveLength(1));
    expect(google.maps[0].element.hasAttribute("inert")).toBe(true);

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(document.activeElement).toBe(mapRegion());
    await pinsShown(2);
    expect(getCompetitionMap).toHaveBeenCalledTimes(2);
    expect(google.maps[0].element.hasAttribute("inert")).toBe(false);
  });

  it("says when nothing matches the search, and can clear the filters", async () => {
    vi.mocked(getCompetitionMap).mockImplementation(answer([]));
    const onClearFilters = vi.fn();
    render(mapWith({ onClearFilters }));

    expect(
      await screen.findByRole("heading", { name: "No competitions match your search" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(mapRegion());
    expect(google.maps[0].fitted).toHaveLength(0);
  });

  it("points to the list for competitions that have no map location", async () => {
    vi.mocked(getCompetitionMap).mockImplementation(
      answer([lakeshoreJam], { total: 3, unmapped: 2 }),
    );
    render(mapWith());

    await pinsShown(1);
    const note = screen.getByText(/2 competitions without a map location are only in the list/);
    expect(
      within(note).getByRole("link", { name: "Open competition list" }).getAttribute("href"),
    ).toBe("/competitions?q=Open");
  });

  it("says so when none of the competitions found has a map location", async () => {
    vi.mocked(getCompetitionMap).mockImplementation(answer([], { total: 2, unmapped: 2 }));
    render(mapWith());

    expect(await screen.findByRole("heading", { name: "No map locations yet" })).toBeTruthy();
    expect(screen.getByText(/These competitions don't have a map location yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open competition list" })).toBeTruthy();
  });

  it("tells the page how many competitions it found and how many are on the map", async () => {
    vi.mocked(getCompetitionMap).mockImplementation(
      answer([autumnOpen, lakeshoreJam], { total: 3, unmapped: 1 }),
    );
    const onSummaryChange = vi.fn();
    render(mapWith({ onSummaryChange }));

    await waitFor(() =>
      expect(onSummaryChange).toHaveBeenLastCalledWith("3 competitions found, 2 on the map"),
    );
    expect(onSummaryChange).toHaveBeenCalledWith("Finding competition locations…");
  });
});
