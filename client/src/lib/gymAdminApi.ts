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
  registeredClimberCount?: number;
  tools: { key: string; label: string; story: string }[];
}
export interface CreateCompetitionInput {
  name: string;
  date: string;
  location?: string;
  description?: string;
  capacity: number;
  /** Only needed when the authenticated Gym Admin has more than one assigned active gym. */
  gymId?: string;
}

export interface UpdateCompetitionInput {
  name?: string;
  date?: string;
  location?: string;
  description?: string;
  capacity?: number;
  registrationStatus?: "OPEN" | "CLOSED";
}

/** Reads one of the Gym Admin's private resources with the in-memory access token (US-011). */
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

/** Creates a competition (US-012). The request is never retried, and the server picks the gym
 * and the starting status. */
export function createManagedCompetition(details: CreateCompetitionInput, signal?: AbortSignal) {
  const body: CreateCompetitionInput = {
    name: details.name, date: details.date, capacity: details.capacity,
    ...(details.location ? { location: details.location } : {}),
    ...(details.description ? { description: details.description } : {}),
    ...(details.gymId ? { gymId: details.gymId } : {}),
  };
  return withAccessToken(token => apiRequest<ManagedCompetitionDetails>("/api/gym-admin/competitions", {
    method: "POST", body, headers: { Authorization: "Bearer " + token }, signal,
  }));
}

export function getManagedCompetition(competitionId: string, signal?: AbortSignal) {
  return read<ManagedCompetitionDetails>(`/api/gym-admin/competitions/${encodeURIComponent(competitionId)}`, signal);
}

/** US-013: update only permitted fields on one of the Gym Admin's competitions. */
export function updateManagedCompetition(
  competitionId: string,
  details: UpdateCompetitionInput,
  signal?: AbortSignal,
) {
  return withAccessToken(token => apiRequest<ManagedCompetitionDetails>(
    `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}`,
    {
      method: "PATCH",
      body: details,
      headers: { Authorization: "Bearer " + token },
      signal,
    },
  ));
}
