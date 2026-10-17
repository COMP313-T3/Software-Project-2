import { DISCOVERY_SEARCH_MAX_LENGTH, type DiscoveryFilters } from "./discoveryApi.ts";
export type DiscoveryErrors = Partial<Record<keyof DiscoveryFilters | "page", string>>;
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Matches the existing discovery query contract; the server enforces visibility and scope. */
export function validateDiscoveryFilters(filters: DiscoveryFilters, maxRadiusKm = 200): DiscoveryErrors {
  const errors: DiscoveryErrors = {};
  if (filters.q.trim().length > DISCOVERY_SEARCH_MAX_LENGTH) errors.q = `Use ${DISCOVERY_SEARCH_MAX_LENGTH} characters or fewer.`;
  if (filters.q.trim().split(/\s+/).filter(Boolean).length > 5) errors.q = "Use up to 5 search words.";
  if (filters.gymId && !/^[a-f\d]{24}$/i.test(filters.gymId)) errors.gymId = "Choose a valid gym.";
  for (const key of ["from", "to"] as const) if (filters[key] && !validDate(filters[key])) errors[key] = "Choose a valid date.";
  if (!errors.from && !errors.to && filters.from && filters.to && filters.to < filters.from) errors.to = "Choose an end date on or after the start date.";
  if (!["any", "open"].includes(filters.registration)) errors.registration = "Choose a valid registration filter.";
  const radius = Number(filters.radiusKm);
  if (filters.radiusKm.trim() && (!Number.isFinite(radius) || radius < 1 || radius > maxRadiusKm)) errors.radiusKm = `Choose a distance from 1 to ${maxRadiusKm} km.`;
  return errors;
}
