import { describe, expect, it } from "vitest";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import { fakeGoogleMaps } from "../../test/fakeGoogleMaps.ts";
import { placesOf } from "./mapPlaces.ts";
import { boundsAround, circleBounds, fitToPlaces, revealPlace } from "./useGoogleMap.ts";

const NORTHSIDE = { lat: 43.6532, lng: -79.3832 };
const LAKESHORE = { lat: 43.5891, lng: -79.6441 };

function at(coordinates: { lat: number; lng: number }, id: string): DiscoveredCompetition {
  return {
    _id: id,
    name: `Competition ${id}`,
    date: "2026-11-14",
    location: "Toronto",
    gym: { _id: `gym-${id}`, name: `Gym ${id}` },
    registrationStatus: "OPEN",
    capacity: 80,
    spacesLeft: 80,
    full: false,
    coordinates,
  };
}

async function newMap() {
  const google = fakeGoogleMaps();
  const { Map } = await google.api.importLibrary("maps");
  new Map(document.createElement("div"), { center: NORTHSIDE, zoom: 5, mapId: "DEMO_MAP_ID" });
  return google.maps[0];
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return DOMRect.fromRect({ x: left, y: top, width, height });
}

describe("boundsAround", () => {
  it("holds every place", () => {
    const bounds = boundsAround(placesOf([at(NORTHSIDE, "1"), at(LAKESHORE, "2")]));

    expect(bounds).toEqual({
      north: NORTHSIDE.lat,
      south: LAKESHORE.lat,
      east: NORTHSIDE.lng,
      west: LAKESHORE.lng,
    });
  });

  it("widens a single place to its neighbourhood", () => {
    const bounds = boundsAround(placesOf([at(NORTHSIDE, "1")]));

    expect(bounds.north - bounds.south).toBeCloseTo(0.02);
    expect(bounds.east - bounds.west).toBeCloseTo(0.02);
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(NORTHSIDE.lat);
    expect((bounds.east + bounds.west) / 2).toBeCloseTo(NORTHSIDE.lng);
  });
});

describe("fitToPlaces", () => {
  it("fits the map to the pins with room around them", async () => {
    const map = await newMap();

    fitToPlaces(map, placesOf([at(NORTHSIDE, "1"), at(LAKESHORE, "2")]));

    expect(map.fitted).toEqual([
      {
        bounds: { north: NORTHSIDE.lat, south: LAKESHORE.lat, east: NORTHSIDE.lng, west: LAKESHORE.lng },
        padding: 56,
      },
    ]);
  });

  it("goes back to Toronto when no pins match", async () => {
    const map = await newMap();

    fitToPlaces(map, []);

    expect(map.fitted).toHaveLength(0);
    expect(map.center).toEqual({ lat: 43.6532, lng: -79.3832 });
    expect(map.zoom).toBe(11);
  });

  it("shows the whole circle of a chosen distance, even when no pins match", async () => {
    const map = await newMap();

    fitToPlaces(map, [], { position: NORTHSIDE, radiusKm: 25, title: "Your current location" });

    expect(map.fitted).toEqual([{ bounds: circleBounds(NORTHSIDE, 25), padding: 56 }]);
  });

  it("keeps the starting point in view with the pins when there's no distance", async () => {
    const map = await newMap();

    fitToPlaces(map, placesOf([at(LAKESHORE, "1")]), { position: NORTHSIDE, radiusKm: null, title: "Your saved location" });

    expect(map.fitted).toEqual([
      {
        bounds: { north: NORTHSIDE.lat, south: LAKESHORE.lat, east: NORTHSIDE.lng, west: LAKESHORE.lng },
        padding: 56,
      },
    ]);
  });
});

describe("circleBounds", () => {
  it("reaches the distance each way, with wider longitudes away from the equator", () => {
    const bounds = circleBounds(NORTHSIDE, 10);

    expect(bounds.north - NORTHSIDE.lat).toBeCloseTo(10 / 111.32, 6);
    expect(NORTHSIDE.lat - bounds.south).toBeCloseTo(10 / 111.32, 6);
    expect(bounds.east - NORTHSIDE.lng).toBeCloseTo(10 / (111.32 * Math.cos((NORTHSIDE.lat * Math.PI) / 180)), 6);
    expect(bounds.east - bounds.west).toBeGreaterThan(bounds.north - bounds.south);
  });
});

describe("revealPlace", () => {
  const [place] = placesOf([at(NORTHSIDE, "1")]);
  const point = { north: NORTHSIDE.lat, south: NORTHSIDE.lat, east: NORTHSIDE.lng, west: NORTHSIDE.lng };

  it("keeps the pin above a card that spans the bottom of the map", async () => {
    const map = await newMap();

    revealPlace(map, place, rect(16, 300, 358, 560), rect(24, 520, 342, 332));

    expect(map.revealed).toEqual([
      { bounds: point, padding: { top: 48, right: 16, bottom: 356, left: 16 } },
    ]);
  });

  it("keeps the pin to the right of a card at the left of the map", async () => {
    const map = await newMap();

    revealPlace(map, place, rect(272, 290, 976, 512), rect(289, 350, 360, 430));

    expect(map.revealed).toEqual([
      { bounds: point, padding: { top: 48, right: 16, bottom: 16, left: 393 } },
    ]);
  });
});
