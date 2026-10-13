import { apiRequest, type ApiRequestOptions } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface CompetitionDivision {
  _id: string;
  competitionId: string;
  name: string;
  climberCount: number;
}
export interface ManagedClimberRegistration {
  registrationId: string;
  status: "PENDING" | "CONFIRMED" | "WAITLIST";
  registeredAt: string;
  climber: { _id: string; firstName: string; lastName: string; email: string } | null;
  division: { _id: string; name: string } | null;
}
export interface CompetitionClimberList {
  climbers: ManagedClimberRegistration[];
  total: number;
}

function competitionPath(competitionId: string) {
  return "/api/gym-admin/competitions/" + encodeURIComponent(competitionId);
}

/** Use the shared bearer session, timeout, cancellation and GET-only retry behavior. */
function request<T>(path: string, options: ApiRequestOptions = {}) {
  return withAccessToken(token => apiRequest<T>(path, {
    ...options, headers: { Authorization: "Bearer " + token },
  }));
}

export function listCompetitionDivisions(competitionId: string, signal?: AbortSignal) {
  return request<{ divisions: CompetitionDivision[] }>(competitionPath(competitionId) + "/divisions", { signal });
}

/** The backend accepts the division name; other event information is managed separately. */
export function createCompetitionDivision(competitionId: string, input: { name: string }, signal?: AbortSignal) {
  return request<CompetitionDivision>(competitionPath(competitionId) + "/divisions", {
    method: "POST", body: { name: input.name }, signal,
  });
}

export function listCompetitionClimbers(competitionId: string, divisionId?: string, signal?: AbortSignal) {
  const query = divisionId ? "?" + new URLSearchParams({ divisionId }) : "";
  return request<CompetitionClimberList>(competitionPath(competitionId) + "/climbers" + query, { signal });
}

/** Only the selected competition's registration changes. Failed writes are not retried. */
export function assignClimberDivision(competitionId: string, climberId: string, divisionId: string, signal?: AbortSignal) {
  return request<ManagedClimberRegistration>(
    competitionPath(competitionId) + "/climbers/" + encodeURIComponent(climberId) + "/division",
    { method: "PUT", body: { divisionId }, signal },
  );
}
