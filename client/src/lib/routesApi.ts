import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface CreateRouteInput {
  routeNumber: string;
  name: string;
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

/** US-016 / FR-006: the server checks gym ownership and assigns the official flag.
 * Failed writes are not automatically retried by apiRequest. */
export function createCompetitionRoute(competitionId: string, details: CreateRouteInput, signal?: AbortSignal) {
  const body: CreateRouteInput = {
    routeNumber: details.routeNumber, name: details.name, grade: details.grade,
    ...(details.pointValue !== undefined ? { pointValue: details.pointValue } : {}),
    ...(details.notes?.trim() ? { notes: details.notes.trim() } : {}),
  };
  return withAccessToken(token => apiRequest<CreatedRoute>(
    `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/routes`,
    { method: "POST", body, headers: { Authorization: `Bearer ${token}` }, signal },
  ));
}
