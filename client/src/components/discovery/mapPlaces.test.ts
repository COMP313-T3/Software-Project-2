import { describe, expect, it } from "vitest";
import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import { pinTitle, placeName, placesOf } from "./mapPlaces.ts";

const NORTHSIDE = { lat: 43.6532, lng: -79.3832 };
const LAKESHORE = { lat: 43.5891, lng: -79.6441 };

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
    location: "100 King St W, Toronto",
    gym: { _id: `gym-${gymName}`, name: gymName },
    registrationStatus: "OPEN",
    capacity: 80,
    spacesLeft: 80,
    full: false,
    coordinates,
  };
}

describe("placesOf (US-027 criterion 3)", () => {
  it("puts competitions at the same spot in one place, keeping the API's order", () => {
    const places = placesOf([
      competition("1", "Autumn Open", NORTHSIDE),
      competition("2", "Lakeshore Jam", LAKESHORE, "Lakeshore Boulders"),
      competition("3", "Winter Open", { lat: 43.653200001, lng: -79.383200001 }),
    ]);

    expect(places).toHaveLength(2);
    expect(places[0].position).toEqual(NORTHSIDE);
    expect(places[0].competitions.map(({ name }) => name)).toEqual([
      "Autumn Open",
      "Winter Open",
    ]);
    expect(places[1].competitions.map(({ name }) => name)).toEqual(["Lakeshore Jam"]);
    expect(places[0].id).not.toBe(places[1].id);
  });

  it("leaves out competitions without a position that can be drawn", () => {
    const places = placesOf([
      competition("1", "No pin", null),
      competition("2", "Not a number", { lat: Number.NaN, lng: -79.4 }),
      competition("3", "Too far north", { lat: 91, lng: -79.4 }),
      competition("4", "Too far east", { lat: 43.6, lng: 181 }),
      competition("5", "On the map", NORTHSIDE),
    ]);

    expect(places).toHaveLength(1);
    expect(places[0].competitions.map(({ name }) => name)).toEqual(["On the map"]);
  });
});

describe("placeName and pinTitle", () => {
  it("names a place after its gym and counts its competitions", () => {
    const [single] = placesOf([competition("1", "Autumn Open", NORTHSIDE)]);
    const [shared] = placesOf([
      competition("1", "Autumn Open", NORTHSIDE),
      competition("2", "Winter Open", NORTHSIDE),
    ]);

    expect(placeName(single)).toBe("Northside Climbing");
    expect(pinTitle(single)).toBe("Autumn Open at Northside Climbing");
    expect(pinTitle(shared)).toBe("2 competitions at Northside Climbing");
  });

  it("uses the location when the competitions there are at different gyms", () => {
    const [mixed] = placesOf([
      competition("1", "Autumn Open", NORTHSIDE),
      competition("2", "Guest Night", NORTHSIDE, "Visiting Gym"),
    ]);

    expect(placeName(mixed)).toBe("100 King St W, Toronto");
    expect(pinTitle(mixed)).toBe("2 competitions at 100 King St W, Toronto");
  });
});
