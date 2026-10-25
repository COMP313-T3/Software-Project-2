import { ApiError, apiRequest } from "./apiClient.ts";
import type { LatLngLiteral } from "./googleMaps.ts";

/** What the location step fills in from a suggestion or a map pin. */
export interface FoundLocation {
  address: string;
  postalCode: string;
  country: string;
  location: LatLngLiteral;
}

async function lookUp(path: string): Promise<FoundLocation | null> {
  try {
    return await apiRequest<FoundLocation>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Asks the API for the address and location of a place picked from the address suggestions.
 * The API looks it up with Google's Geocoding API, whose results may be kept with the person's
 * account.
 *
 * @param placeId The suggestion's place ID.
 * @returns The address and location, or null when Google doesn't know the place.
 * @throws {ApiError} When the lookup isn't available or the API can't be reached.
 */
export function findPlace(placeId: string): Promise<FoundLocation | null> {
  return lookUp(`/api/geocode/place?${new URLSearchParams({ id: placeId })}`);
}

/**
 * Asks the API for the address at a point on the map.
 *
 * @param point The point, in decimal degrees.
 * @returns The closest address, or null when there is none.
 * @throws {ApiError} When the lookup isn't available or the API can't be reached.
 */
export function findAddressAt(
  point: LatLngLiteral,
): Promise<FoundLocation | null> {
  const query = new URLSearchParams({
    lat: point.lat.toFixed(6),
    lng: point.lng.toFixed(6),
  });
  return lookUp(`/api/geocode/location?${query}`);
}
