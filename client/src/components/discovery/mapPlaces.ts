import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";
import type { LatLngLiteral } from "../../lib/googleMaps.ts";

/**
 * One pin on the Competition Map View: every available competition at the same spot, so two
 * events at one gym never hide under each other (US-027 criteria 3 to 5).
 */
export interface MapPlace {
  /** The position rounded to about a metre, which also identifies the place. */
  id: string;
  position: LatLngLiteral;
  /** Its competitions, soonest first, in the order the API sent them. */
  competitions: DiscoveredCompetition[];
}

function onMap(
  position: DiscoveredCompetition["coordinates"],
): position is LatLngLiteral {
  return (
    position !== null &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

/**
 * Groups map pins from the discovery API by where they go. Competitions without a valid position
 * are left out, since they can't be drawn.
 *
 * @param competitions The pins from GET /api/competitions/map, in the order it sent them.
 * @returns One place per position, in the order each position first appears.
 */
export function placesOf(competitions: DiscoveredCompetition[]): MapPlace[] {
  const places = new Map<string, MapPlace>();
  for (const competition of competitions) {
    const { coordinates } = competition;
    if (!onMap(coordinates)) continue;
    const id = `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
    const place = places.get(id);
    if (place) {
      place.competitions.push(competition);
    } else {
      places.set(id, {
        id,
        position: { lat: coordinates.lat, lng: coordinates.lng },
        competitions: [competition],
      });
    }
  }
  return [...places.values()];
}

/**
 * What a place is called: its gym, when every competition there is at the same gym, or else the
 * first competition's location.
 *
 * @param place The place.
 * @returns The name to show.
 */
export function placeName(place: MapPlace): string {
  const [first] = place.competitions;
  const gymName = first.gym?.name;
  const oneGym =
    gymName !== undefined &&
    place.competitions.every((competition) => competition.gym?.name === gymName);
  return oneGym ? gymName : first.location;
}

/**
 * The pin's accessible name, which screen readers read and the pin shows as its tooltip.
 *
 * @param place The place.
 * @returns Text like "Autumn Open at Northside Climbing" or "2 competitions at Northside Climbing".
 */
export function pinTitle(place: MapPlace): string {
  const count = place.competitions.length;
  if (count === 1) return `${place.competitions[0].name} at ${placeName(place)}`;
  return `${count} competitions at ${placeName(place)}`;
}
