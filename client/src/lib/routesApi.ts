import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface CreateRouteInput {
  routeNumber: string;
  name?: string;
  grade: string;
  pointValue?: number;
  notes?: string;
}
export interface CreatedRoute {
  routeId: string;
  competitionId: string;
  grade: string;
  official: boolean;
}
export interface ManagedRoute extends CreatedRoute {
  routeNumber: string;
  name?: string;
  pointValue?: number;
  notes?: string;
}
export interface UpdateRouteInput {
  grade?: string;
  pointValue?: number;
  /** An empty string explicitly clears the saved notes. */
  notes?: string;
}
export interface CompetitionRouteList {
  routes: ManagedRoute[];
  total: number;
}

function routePath(competitionId: string, routeId: string) {
  return `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/routes/${encodeURIComponent(routeId)}`;
}

/** US-016, US-017: every route of one of the Gym Admin's competitions, by route number. */
export function listCompetitionRoutes(competitionId: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<CompetitionRouteList>(
    `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/routes`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  ));
}

/** US-017: the API scopes both identifiers to the administrator's active gyms. */
export function getCompetitionRoute(competitionId: string, routeId: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<ManagedRoute>(routePath(competitionId, routeId), {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}

/** Only the three fields exposed by the US-017 edit form may be sent here. */
export function updateCompetitionRoute(competitionId: string, routeId: string, details: UpdateRouteInput, signal?: AbortSignal) {
  const body: UpdateRouteInput = {
    ...(details.grade !== undefined ? { grade: details.grade } : {}),
    ...(details.pointValue !== undefined ? { pointValue: details.pointValue } : {}),
    ...(details.notes !== undefined ? { notes: details.notes } : {}),
  };
  return withAccessToken(token => apiRequest<ManagedRoute>(routePath(competitionId, routeId), {
    method: "PATCH", body, headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}

/** US-016 / FR-006: the server checks gym ownership and assigns the official flag.
 * Failed writes are not automatically retried by apiRequest. */
export function createCompetitionRoute(competitionId: string, details: CreateRouteInput, signal?: AbortSignal) {
  const body: CreateRouteInput = {
    routeNumber: details.routeNumber,
    ...(details.name?.trim() ? { name: details.name.trim() } : {}),
    grade: details.grade,
    ...(details.pointValue !== undefined ? { pointValue: details.pointValue } : {}),
    ...(details.notes?.trim() ? { notes: details.notes.trim() } : {}),
  };
  return withAccessToken(token => apiRequest<CreatedRoute>(
    `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/routes`,
    { method: "POST", body, headers: { Authorization: `Bearer ${token}` }, signal },
  ));
}
