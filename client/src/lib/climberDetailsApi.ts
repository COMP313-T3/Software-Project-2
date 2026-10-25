import { apiRequest, type ApiRequestOptions } from "./apiClient.ts";
import type { ManagedClimberRegistration } from "./divisionsApi.ts";
import { withAccessToken } from "./sessionClient.ts";

function climberPath(competitionId: string, climberId: string) {
  return "/api/gym-admin/competitions/" + encodeURIComponent(competitionId) +
    "/climbers/" + encodeURIComponent(climberId);
}

function request<T>(competitionId: string, climberId: string, options: ApiRequestOptions) {
  return withAccessToken(token => apiRequest<T>(climberPath(competitionId, climberId), {
    ...options, headers: { Authorization: "Bearer " + token },
  }));
}

/** US-015: read one authorized competition registration, using the Climber's user ID. */
export function getClimberDetails(competitionId: string, climberId: string, signal?: AbortSignal) {
  return request<ManagedClimberRegistration>(competitionId, climberId, { signal });
}

/** The current API permits changing divisionId only; account/profile fields are never sent. */
export function updateClimberDetails(
  competitionId: string, climberId: string, details: { divisionId: string }, signal?: AbortSignal,
) {
  return request<ManagedClimberRegistration>(competitionId, climberId, {
    method: "PATCH", body: { divisionId: details.divisionId }, signal,
  });
}

/** Removes only this event registration. The API confirms success with an empty 204. */
export function removeClimberRegistration(competitionId: string, climberId: string, signal?: AbortSignal) {
  return request<void>(competitionId, climberId, { method: "DELETE", signal });
}
