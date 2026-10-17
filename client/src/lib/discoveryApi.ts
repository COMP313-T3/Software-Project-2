import { ApiError, apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface DiscoveryFilters { q: string; gymId: string; from: string; to: string; registration: string; radiusKm: string }
export interface DiscoveredCompetition {
  _id: string; name: string; date: string; location: string;
  gym: { _id: string; name: string } | null;
  registrationStatus: "OPEN" | "CLOSED"; capacity: number; spacesLeft: number; full: boolean;
  coordinates: { lat: number; lng: number } | null; distanceKm?: number | null;
}
export interface DiscoveryResults { competitions: DiscoveredCompetition[]; total: number; page: number; limit: number }
export interface DiscoveryOptions {
  gyms: { _id: string; name: string; location: string; competitionCount: number }[];
  registration: { value: string; label: string }[]; maxRadiusKm: number; hasSavedLocation: boolean;
}
export interface DiscoveredEventDetails extends DiscoveredCompetition {
  description: string; upcoming: boolean; registrationAvailable: boolean;
  divisions: { _id: string; name: string }[];
  scoringFormat: { format: string; label: string } | null;
  myRegistration: { status: "CONFIRMED" | "PENDING" | "WAITLIST"; registeredAt: string; division: { _id: string; name: string } | null } | null;
}
export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = { q: "", gymId: "", from: "", to: "", registration: "any", radiusKm: "" };
export const DISCOVERY_FILTER_FIELDS = ["q", "gymId", "from", "to", "registration", "radiusKm"] as const;
export const DISCOVERY_SEARCH_MAX_LENGTH = 100;
export const discoveryProblem = (error: unknown, fallback: string) => error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message : fallback;
export function readDiscoveryFilters(params: URLSearchParams): DiscoveryFilters {
  return Object.fromEntries(DISCOVERY_FILTER_FIELDS.map(key => [key, params.get(key) ?? EMPTY_DISCOVERY_FILTERS[key]])) as unknown as DiscoveryFilters;
}
/** Shareable search state; pagination is reset whenever a new filter set is applied. */
export function discoverySearch(filters: DiscoveryFilters, page = 1) {
  const params = new URLSearchParams();
  for (const field of DISCOVERY_FILTER_FIELDS) {
    const value = filters[field].trim();
    if (value && !(field === "registration" && value === "any")) params.set(field, value);
  }
  if (page > 1) params.set("page", String(page));
  return params;
}
function read<T>(path: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<T>(path, { headers: { Authorization: `Bearer ${token}` }, signal }));
}
export function discoverCompetitions(filters: DiscoveryFilters, page = 1, signal?: AbortSignal) {
  const query = discoverySearch(filters, page); query.set("page", String(page)); query.set("limit", "20");
  return read<DiscoveryResults>(`/api/competitions?${query}`, signal);
}
export function getDiscoveryOptions(signal?: AbortSignal) { return read<DiscoveryOptions>("/api/competitions/filters", signal); }
export function getDiscoveredEvent(id: string, signal?: AbortSignal) {
  return read<DiscoveredEventDetails>(`/api/competitions/${encodeURIComponent(id)}`, signal);
}
