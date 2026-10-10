import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export type CompetitionPeriod = "upcoming" | "past" | "all";
export interface ManagedGym { _id: string; name: string; location: string }
export interface ManagedCompetition {
  _id: string;
  gymId: string;
  gym: { _id: string; name: string } | null;
  name: string;
  date: string;
  location: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  registrationStatus: "OPEN" | "CLOSED";
  capacity: number;
}
export interface GymAdminSummary {
  gyms: ManagedGym[];
  counts: { upcoming: number; past: number; drafts: number };
  upcoming: ManagedCompetition[];
}
export interface ManagedCompetitionPage {
  competitions: ManagedCompetition[]; total: number; page: number; limit: number;
}
export interface ManagedCompetitionDetails extends ManagedCompetition {
  description?: string;
  tools: { key: string; label: string; story: string }[];
}

/** US-011: use the existing session refresh and the gym-scoped backend routes.
 * Tokens stay in memory; no public competition endpoint is used for private data. */
function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  return withAccessToken(token => apiRequest<T>(path, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}

export function fetchGymAdminDashboard(signal?: AbortSignal) {
  return read<GymAdminSummary>("/api/gym-admin/dashboard", signal);
}

export function listManagedCompetitions(
  options: { period: CompetitionPeriod; gymId?: string; page: number },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ period: options.period, page: String(options.page), limit: "20" });
  if (options.gymId) query.set("gymId", options.gymId);
  return read<ManagedCompetitionPage>(`/api/gym-admin/competitions?${query}`, signal);
}

export function getManagedCompetition(competitionId: string, signal?: AbortSignal) {
  return read<ManagedCompetitionDetails>(`/api/gym-admin/competitions/${encodeURIComponent(competitionId)}`, signal);
}
