import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** A competition's scoring (US-018): the share of a problem's points taken off for each failed
 * attempt before a top, and the attempts each problem allows. */
export interface ScoringSettings { deductionPercent: number; maxAttempts: number }
export type SavedScoring = ScoringSettings & { updatedBy?: string; updatedAt?: string };
export interface CompetitionScoring {
  competitionId: string;
  scoring: SavedScoring | null;
  readiness: { routes: number; routesWithoutPoints: number; ready: boolean; warnings: string[] };
}
function scoringPath(id: string) { return `/api/gym-admin/competitions/${encodeURIComponent(id)}/scoring`; }

/** The saved scoring of one of the Gym Admin's competitions, and what's still missing before
 * results can be entered. */
export function getCompetitionScoring(id: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<CompetitionScoring>(scoringPath(id), {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}
/** Send only editable settings; the server records who saved them and when. */
export function saveCompetitionScoring(id: string, settings: ScoringSettings, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<CompetitionScoring>(scoringPath(id), {
    method: "PUT", body: { deductionPercent: settings.deductionPercent, maxAttempts: settings.maxAttempts },
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}
