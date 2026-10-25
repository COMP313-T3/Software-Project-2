import { describe, expect, it } from "vitest";
import { fromGeoPoint, toGeoPoint } from "../src/utils/geoPoints.js";

describe("competition map coordinates", () => {
  it("converts valid GeoJSON coordinates in longitude-latitude order", () => {
    expect(fromGeoPoint(toGeoPoint({ lat: 43.6532, lng: -79.3832 }))).toEqual({
      lat: 43.6532,
      lng: -79.3832,
    });
  });

  it.each([
    ["missing point", null],
    ["missing coordinates", {}],
    ["wrong coordinate count", { coordinates: [-79.3] }],
    ["invalid longitude", { coordinates: [181, 43.6] }],
    ["invalid latitude", { coordinates: [-79.3, -91] }],
    ["non-finite coordinates", { coordinates: [Number.NaN, 43.6] }],
  ])("rejects %s", (_reason, point) => {
    expect(fromGeoPoint(point)).toBeNull();
  });
});
