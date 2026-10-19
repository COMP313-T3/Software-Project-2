import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import { fakeGoogleMaps, type StubMarker } from "../../test/fakeGoogleMaps.ts";
import { createPinLayer } from "./mapPins.ts";
import { placesOf } from "./mapPlaces.ts";

const NORTHSIDE = { lat: 43.6532, lng: -79.3832 };
const LAKESHORE = { lat: 43.5891, lng: -79.6441 };

function competition(
  id: string,
  name: string,
  coordinates: { lat: number; lng: number },
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

const autumn = competition("1", "Autumn Open", NORTHSIDE);
const winter = competition("2", "Winter Open", NORTHSIDE);
const lakeshore = competition("3", "Lakeshore Jam", LAKESHORE, "Lakeshore Boulders");

async function layerWith() {
  const google = fakeGoogleMaps();
  const { Map } = await google.api.importLibrary("maps");
  const markers = await google.api.importLibrary("marker");
  const container = document.createElement("div");
  document.body.append(container);
  const map = new Map(container, { center: NORTHSIDE, zoom: 11, mapId: "DEMO_MAP_ID" });
  const onSelect = vi.fn();
  const onFocus = vi.fn();
  const pins = createPinLayer(map, markers, { onSelect, onFocus });
  return { google, map: google.maps[0], pins, onSelect, onFocus };
}

function look(marker: StubMarker) {
  return marker.content as HTMLElement;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createPinLayer (US-027 criteria 3 and 4)", () => {
  it("puts one clickable pin on the map for each place", async () => {
    const { google, map, pins } = await layerWith();

    pins.show(placesOf([autumn, winter, lakeshore]));

    const shown = google.shownMarkers();
    expect(shown).toHaveLength(2);
    expect(shown.map(({ title }) => title)).toEqual([
      "2 competitions at Northside Climbing",
      "Lakeshore Jam at Lakeshore Boulders",
    ]);
    expect(shown.map(({ position }) => position)).toEqual([NORTHSIDE, LAKESHORE]);
    expect(shown.every(({ gmpClickable, map: on }) => gmpClickable && on === map)).toBe(true);
    expect(look(shown[0]).textContent).toBe("2");
    expect(look(shown[1]).textContent).toBe("");
    expect(look(shown[0]).getAttribute("aria-hidden")).toBe("true");
  });

  it("selects the place whose pin is clicked", async () => {
    const { google, pins, onSelect } = await layerWith();
    const places = placesOf([autumn, lakeshore]);
    pins.show(places);

    google.shownMarkers()[1].clickPin();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(places[1]);
  });

  it("reports the place whose pin receives keyboard focus", async () => {
    const { google, pins, onFocus } = await layerWith();
    const places = placesOf([autumn, lakeshore]);
    pins.show(places);

    google.shownMarkers()[0].focus();

    expect(onFocus).toHaveBeenCalledWith(places[0]);
  });

  it("marks the selected pin and draws it above the others, which all get a z-index", async () => {
    const { google, pins } = await layerWith();
    pins.show(placesOf([autumn, lakeshore]));
    const [first, second] = google.shownMarkers();
    expect([first.zIndex, second.zIndex]).toEqual([0, 0]);

    pins.select(placesOf([lakeshore])[0].id);

    expect(look(second).dataset.selected).toBe("true");
    expect(second.zIndex).toBe(1);
    expect(look(first).dataset.selected).toBe("false");
    expect(first.zIndex).toBe(0);

    pins.select(null);
    expect(look(second).dataset.selected).toBe("false");
    expect(second.zIndex).toBe(0);
  });

  it("keeps, updates, adds and removes pins as the results change", async () => {
    const { google, pins } = await layerWith();
    pins.show(placesOf([autumn, lakeshore]));
    const [northside, lake] = google.shownMarkers();

    pins.show(placesOf([autumn, winter]));

    expect(google.shownMarkers()).toEqual([northside]);
    expect(lake.map).toBeNull();
    expect(lake.isConnected).toBe(false);
    expect(northside.title).toBe("2 competitions at Northside Climbing");
    expect(look(northside).textContent).toBe("2");

    pins.show(placesOf([autumn, winter, lakeshore]));
    expect(google.shownMarkers()).toHaveLength(2);
    expect(google.markers).toHaveLength(3);
  });

  it("keeps the selection on a pin that stays after new results", async () => {
    const { google, pins } = await layerWith();
    const [place] = placesOf([autumn]);
    pins.show([place]);
    pins.select(place.id);

    pins.show(placesOf([autumn, winter]));

    expect(look(google.shownMarkers()[0]).dataset.selected).toBe("true");
  });

  it("moves keyboard focus back to a pin", async () => {
    const { google, pins } = await layerWith();
    const [place] = placesOf([autumn]);
    pins.show([place]);

    expect(pins.focus(place.id)).toBe(true);
    expect(document.activeElement).toBe(google.shownMarkers()[0]);
    expect(pins.focus("missing")).toBe(false);
  });

  it("takes every pin off the map when cleared", async () => {
    const { google, pins } = await layerWith();
    pins.show(placesOf([autumn, lakeshore]));

    pins.clear();

    expect(google.shownMarkers()).toHaveLength(0);
  });
});
