/** The Earth's mean radius, used for distance filters and the distances shown to Climbers. */
export const EARTH_RADIUS_KM = 6371;

/**
 * Turns a map pin into the GeoJSON point MongoDB stores. GeoJSON puts longitude first.
 *
 * @param {{ lat: number, lng: number }} pin The pin, in decimal degrees.
 * @returns {{ type: "Point", coordinates: [number, number] }} The point.
 */
export function toGeoPoint({ lat, lng }) {
  return { type: "Point", coordinates: [lng, lat] };
}

/**
 * Turns a stored GeoJSON point back into the { lat, lng } the client uses.
 *
 * @param {{ coordinates?: number[] } | null | undefined} point The stored point, if any.
 * @returns {{ lat: number, lng: number } | null} The pin, or null when there is none.
 */
export function fromGeoPoint(point) {
  if (!Array.isArray(point?.coordinates) || point.coordinates.length !== 2) return null;
  const [lng, lat] = point.coordinates;
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  ) {
    return null;
  }
  return { lat, lng };
}

/**
 * The great-circle distance between two pins, rounded to 0.1 km.
 *
 * @param {{ lat: number, lng: number }} from One pin.
 * @param {{ lat: number, lng: number }} to The other.
 * @returns {number} The distance in kilometres.
 */
export function distanceKm(from, to) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.round(km * 10) / 10;
}
