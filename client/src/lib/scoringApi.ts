import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface ScoringFormatOption {
  format: string;
  label: string;
  description: string;
  usesPointValues: boolean;
  allowsFlashBonus: boolean;
}
export interface ScoringSettings { format: string; flashBonus: number }
export interface CompetitionScoring {
  competitionId: string;
  scoring: (ScoringSettings & { updatedBy?: string; updatedAt?: string }) | null;
  readiness: { routes: number; routesWithoutPoints: number; ready: boolean; warnings: string[] };
}
export const FLASH_BONUS_MAX = 1000;
function scoringPath(id: string) { return `/api/gym-admin/competitions/${encodeURIComponent(id)}/scoring`; }

/** The backend owns the list of supported formats and their descriptions. */
export function listScoringFormats(signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<{ formats: ScoringFormatOption[] }>("/api/gym-admin/scoring-formats", {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}
export function getCompetitionScoring(id: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<CompetitionScoring>(scoringPath(id), {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}
/** Send only editable settings; the server records who saved them and when. */
export function saveCompetitionScoring(id: string, settings: ScoringSettings, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<CompetitionScoring>(scoringPath(id), {
    method: "PUT", body: { format: settings.format, flashBonus: settings.flashBonus },
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}
