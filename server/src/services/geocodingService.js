const GEOCODING_URL = "https://geocode.googleapis.com/v4/geocode";
const LOOKUP_TIMEOUT_MS = 5_000;
const BUILDING_TYPES = ["street_address", "premise"];

/**
 * @typedef {object} FoundAddress
 * @property {string} address Street and city line, for example "123 Queen Street West, Toronto, ON".
 * @property {string} postalCode Postal code, or an empty string.
 * @property {string} country ISO 3166-1 alpha-2 code, such as CA.
 * @property {{ lat: number, lng: number }} location Where the address is.
 */

function component(components, type, form = "longText") {
  return components.find((part) => part.types?.includes(type))?.[form] ?? "";
}

/**
 * Turns Google's address parts into the street and city line, postal code, and country code the
 * sign-up form uses.
 *
 * @param {{ longText?: string, shortText?: string, types?: string[] }[]} components Address parts from Google.
 * @returns {{ address: string, postalCode: string, country: string }} The address line, postal code, and country code.
 */
export function addressFromComponents(components) {
  const street = [
    component(components, "street_number"),
    component(components, "route"),
  ]
    .filter(Boolean)
    .join(" ");
  const unit = component(components, "subpremise");
  const city =
    component(components, "locality") ||
    component(components, "postal_town") ||
    component(components, "sublocality") ||
    component(components, "administrative_area_level_2");
  const region = component(
    components,
    "administrative_area_level_1",
    "shortText",
  );

  return {
    address: [unit && street ? `${unit}-${street}` : street, city, region]
      .filter(Boolean)
      .join(", "),
    postalCode: component(components, "postal_code"),
    country: component(components, "country", "shortText"),
  };
}

// Google's first result at a point isn't always the building there: it can be a unit whose
// mailing address is elsewhere. Building-level addresses come first, then units, then the rest.
function rank(result) {
  const types = result.types ?? [];
  const building = BUILDING_TYPES.some((type) => types.includes(type));
  if (building && !types.includes("subpremise")) return 0;
  if (building || types.includes("subpremise")) return 1;
  return 2;
}

function toFoundAddress(result) {
  const { latitude, longitude } = result?.location ?? {};
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  return {
    ...addressFromComponents(result.addressComponents ?? []),
    location: { lat: latitude, lng: longitude },
  };
}

async function askGoogle(path, apiKey) {
  const response = await fetch(`${GEOCODING_URL}/${path}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": apiKey },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const reason = detail?.error?.message ? `: ${detail.error.message}` : "";
    throw new Error(`Geocoding returned HTTP ${response.status}${reason}`);
  }
  return response.json();
}

/**
 * Looks up the address and location of a place picked from Google's address suggestions, with
 * Google's Geocoding API v4. Its results may be kept with the person's own account, which
 * coordinates from the suggestion service may not.
 *
 * @param {string} apiKey Google Maps key that can use the Geocoding API.
 * @param {string} placeId The suggestion's place ID.
 * @returns {Promise<FoundAddress | null>} The address, or null when Google doesn't know the place.
 * @throws {Error} When Google can't be reached in time or refuses the request.
 */
export async function lookUpPlace(apiKey, placeId) {
  const result = await askGoogle(
    `places/${encodeURIComponent(placeId)}`,
    apiKey,
  );
  return result ? toFoundAddress(result) : null;
}

/**
 * Looks up the address at a point on the map with Google's Geocoding API v4.
 *
 * @param {string} apiKey Google Maps key that can use the Geocoding API.
 * @param {{ lat: number, lng: number }} point The point, in decimal degrees.
 * @returns {Promise<FoundAddress | null>} The closest address, or null when there is none.
 * @throws {Error} When Google can't be reached in time or refuses the request.
 */
export async function lookUpLocation(apiKey, { lat, lng }) {
  const answer = await askGoogle(`location/${lat},${lng}`, apiKey);
  const results = answer?.results ?? [];
  const best = results.reduce(
    (chosen, result) => (rank(result) < rank(chosen) ? result : chosen),
    results[0],
  );
  return best ? toFoundAddress(best) : null;
}
