import { DISCOVERY_SEARCH_MAX_LENGTH, DISCOVERY_SORT_CHOICES, type DiscoveryFilters } from "./discoveryApi.ts";
export type DiscoveryErrors = Partial<Record<keyof DiscoveryFilters | "page", string>>;
const STARTING_POINTS = ["", "current", "place", "saved"];
const COORDINATE = /^-?\d{1,3}(\.\d{1,15})?$/;
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validCoordinate(value: string, maxDegrees: number) {
  return COORDINATE.test(value.trim()) && Math.abs(Number(value)) <= maxDegrees;
}
/**
 * Matches the existing discovery query contract; the server enforces visibility and scope.
 * hasSavedLocation is false only once the filter choices say the account has no saved location.
 */
export function validateDiscoveryFilters(filters: DiscoveryFilters, maxRadiusKm = 200, hasSavedLocation = true): DiscoveryErrors {
  const errors: DiscoveryErrors = {};
  if (filters.q.trim().length > DISCOVERY_SEARCH_MAX_LENGTH) errors.q = `Use ${DISCOVERY_SEARCH_MAX_LENGTH} characters or fewer.`;
  if (filters.q.trim().split(/\s+/).filter(Boolean).length > 5) errors.q = "Use up to 5 search words.";
  if (filters.gymId && !/^[a-f\d]{24}$/i.test(filters.gymId)) errors.gymId = "Choose a valid gym.";
  for (const key of ["from", "to"] as const) if (filters[key] && !validDate(filters[key])) errors[key] = "Choose a valid date.";
  if (!errors.from && !errors.to && filters.from && filters.to && filters.to < filters.from) errors.to = "Choose an end date on or after the start date.";
  if (!["any", "open"].includes(filters.registration)) errors.registration = "Choose a valid registration filter.";
  if (!STARTING_POINTS.includes(filters.near)) errors.near = "Choose a starting point.";
  else if (filters.near === "place" && !(validCoordinate(filters.lat, 90) && validCoordinate(filters.lng, 180))) errors.near = "Choose a place from the suggestions or on the map.";
  else if (filters.near === "saved" && !hasSavedLocation) errors.near = "Your account doesn't have a saved location. Choose another starting point.";
  const radius = Number(filters.radiusKm);
  if (filters.radiusKm.trim() && !filters.near) errors.radiusKm = "Choose a starting point first.";
  else if (filters.radiusKm.trim() && (!Number.isFinite(radius) || radius < 1 || radius > maxRadiusKm)) errors.radiusKm = `Choose a distance from 1 to ${maxRadiusKm} km.`;
  if (filters.sort && !DISCOVERY_SORT_CHOICES.some(choice => choice.value === filters.sort)) errors.sort = "Choose an order from the list.";
  else if (filters.sort === "closest" && !filters.near) errors.sort = "Choose a starting point to sort by distance.";
  return errors;
}
