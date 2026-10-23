import { ApiError, apiRequest } from "./apiClient.ts";
import type { LatLngLiteral } from "./googleMaps.ts";
import { withAccessToken } from "./sessionClient.ts";

/**
 * The search, filters and order of the Discover page, as text the way the address bar keeps them.
 * near is the starting point: "" for none, "current" for where the Climber is, "place" for a place
 * they searched for (lat, lng and its name in place), or "saved" for the location saved with their
 * account. sort is "" or "soonest" for soonest first, and seed keeps one random order.
 */
export interface DiscoveryFilters {
  q: string; gymId: string; from: string; to: string; registration: string;
  near: string; lat: string; lng: string; place: string; radiusKm: string;
  sort: string; seed: string;
}
export type StartingPoint = "" | "current" | "place" | "saved";
export interface DiscoveredCompetition {
  _id: string; name: string; date: string; location: string;
  gym: { _id: string; name: string } | null;
  registrationStatus: "OPEN" | "CLOSED"; capacity: number; spacesLeft: number; full: boolean;
  /** Climbers with a confirmed registration. */
  joined?: number;
  coordinates: { lat: number; lng: number } | null; distanceKm?: number | null;
}
export interface DiscoveryResults { competitions: DiscoveredCompetition[]; total: number; page: number; limit: number }
/** unmapped counts the competitions without a map location; pending, those whose address the server
 * hasn't looked up yet, which a refresh can add to the map. origin is the starting point, if any. */
export interface CompetitionMapResults { pins: DiscoveredCompetition[]; total: number; unmapped: number; pending: number; truncated: boolean; origin?: LatLngLiteral | null }
export interface DiscoveryChoice { value: string; label: string }
export interface DiscoveryOptions {
  gyms: { _id: string; name: string; location: string; competitionCount: number }[];
  registration: DiscoveryChoice[]; sorts?: DiscoveryChoice[]; distanceChoicesKm?: number[];
  maxRadiusKm: number; hasSavedLocation: boolean;
}
export interface DiscoveredEventDetails extends DiscoveredCompetition {
  description: string; upcoming: boolean; registrationAvailable: boolean;
  divisions: { _id: string; name: string }[];
  /** The competition's scoring in plain words, or null when it isn't set. */
  scoringFormat: { label: string } | null;
  myRegistration: { status: "CONFIRMED" | "PENDING" | "WAITLIST"; registeredAt: string; division: { _id: string; name: string } | null } | null;
}
export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = { q: "", gymId: "", from: "", to: "", registration: "any", near: "", lat: "", lng: "", place: "", radiusKm: "", sort: "", seed: "" };
export const DISCOVERY_FILTER_FIELDS = ["q", "gymId", "from", "to", "registration", "near", "lat", "lng", "place", "radiusKm", "sort", "seed"] as const;
export const DISCOVERY_SEARCH_MAX_LENGTH = 100;
/** The orders and distances the page offers when the API's choices can't be loaded. */
export const DISCOVERY_SORT_CHOICES: DiscoveryChoice[] = [
  { value: "soonest", label: "Soonest first" }, { value: "closest", label: "Closest first" }, { value: "joined", label: "Most joined" },
  { value: "spaces", label: "Most spaces left" }, { value: "random", label: "Random order" },
];
export const DISCOVERY_DISTANCE_CHOICES_KM = [5, 10, 25, 50, 100];
export const DISCOVERY_SEED_MAX = 999_999_999;
const SHUFFLE_SEED = /^[1-9]\d{0,8}$/;
export const discoveryProblem = (error: unknown, fallback: string) => error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message : fallback;

/** A new shuffle number for the random order. */
export function newShuffleSeed() { return String(1 + Math.floor(Math.random() * DISCOVERY_SEED_MAX)); }

/**
 * The search the address bar holds. A shuffle number that isn't one is left out, so the random
 * order falls back to the day's order instead of showing an error the Climber can't fix.
 *
 * @param params The address bar's search.
 * @returns Every filter, with the defaults for the ones it doesn't have.
 */
export function readDiscoveryFilters(params: URLSearchParams): DiscoveryFilters {
  const filters = Object.fromEntries(DISCOVERY_FILTER_FIELDS.map(key => [key, params.get(key) ?? EMPTY_DISCOVERY_FILTERS[key]])) as unknown as DiscoveryFilters;
  // The API measures a distance without a starting point from the saved location, so the page shows it that way.
  if (!filters.near && filters.radiusKm.trim() && !filters.lat && !filters.lng) filters.near = "saved";
  if (filters.seed && !SHUFFLE_SEED.test(filters.seed.trim())) filters.seed = "";
  return filters;
}

/** Whether a field is worth keeping. Where the Climber is stays out of the address bar unless asked for. */
function kept(field: (typeof DISCOVERY_FILTER_FIELDS)[number], value: string, filters: DiscoveryFilters, withCurrentLocation: boolean) {
  switch (field) {
    case "registration": return value !== "any";
    case "lat": case "lng": return filters.near === "place" || (withCurrentLocation && filters.near === "current");
    case "place": return filters.near === "place";
    case "sort": return value !== "soonest";
    case "seed": return filters.sort === "random";
    default: return true;
  }
}

function searchOf(filters: DiscoveryFilters, withCurrentLocation: boolean) {
  const params = new URLSearchParams();
  for (const field of DISCOVERY_FILTER_FIELDS) {
    const value = filters[field].trim();
    if (value && kept(field, value, filters, withCurrentLocation)) params.set(field, value);
  }
  return params;
}

/**
 * Shareable search state for the address bar; pagination is reset whenever a new filter set is
 * applied. Where the Climber is never goes in it, so links and history don't hold their location.
 */
export function discoverySearch(filters: DiscoveryFilters, page = 1) {
  const params = searchOf(filters, false);
  if (page > 1) params.set("page", String(page));
  return params;
}

/** The same search with where the Climber is, for telling one request from another. Never shown or shared. */
export function discoveryRequestKey(filters: DiscoveryFilters) { return searchOf(filters, true).toString(); }

/** What the API is sent. A place's name stays on the page, and the saved location is asked for by name. */
function apiQuery(filters: DiscoveryFilters, withOrder: boolean) {
  const params = searchOf(filters, true);
  params.delete("place");
  if (params.get("near") !== "saved") params.delete("near");
  if (!withOrder) { params.delete("sort"); params.delete("seed"); }
  return params;
}

function read<T>(path: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<T>(path, { headers: { Authorization: `Bearer ${token}` }, signal }));
}
export function discoverCompetitions(filters: DiscoveryFilters, page = 1, signal?: AbortSignal) {
  const query = apiQuery(filters, true); query.set("page", String(page)); query.set("limit", "20");
  return read<DiscoveryResults>(`/api/competitions?${query}`, signal);
}
export function getCompetitionMap(filters: DiscoveryFilters, signal?: AbortSignal) {
  const query = apiQuery(filters, false);
  return read<CompetitionMapResults>(`/api/competitions/map${query.size ? `?${query}` : ""}`, signal);
}
export function getDiscoveryOptions(signal?: AbortSignal) { return read<DiscoveryOptions>("/api/competitions/filters", signal); }
export function getDiscoveredEvent(id: string, signal?: AbortSignal) {
  return read<DiscoveredEventDetails>(`/api/competitions/${encodeURIComponent(id)}`, signal);
}
