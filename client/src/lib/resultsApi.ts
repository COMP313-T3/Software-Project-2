import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";
import { SCORING_ATTEMPTS_MAX } from "../constants/scoring.ts";

/** US-019 -> FR-010 -> AC-014/AC-015. Official scores are read from the server, never submitted. */
export interface ResultClimber {
  _id: string; firstName: string | null; lastName: string | null; registrationStatus: string;
  division: { _id: string; name: string } | null;
}
export interface ResultRoute { _id: string; routeNumber: string; name: string | null; grade: string; pointValue: number | null }
export interface ResultScoring { deductionPercent: number; maxAttempts: number; label: string }
export interface ResultOptions {
  competition: { _id: string; name: string; date: string; status: string };
  scoring: (ResultScoring & { records: { attempts: boolean; sends: boolean; flash: boolean } }) | null;
  canRecord: { allowed: boolean; reasons: string[] };
  climbers: ResultClimber[]; routes: ResultRoute[];
}
export interface OfficialResult {
  resultId: string; competitionId: string; climberId: string; routeId: string;
  attempts: number; sends: number; sent: boolean; flash: boolean; officialScore: number;
  updatedAt?: string;
}
export interface ResultEntry {
  competitionId: string; climber: ResultClimber; route: ResultRoute; scoring: ResultScoring | null;
  result: OfficialResult | null; attemptsLeft: number;
  climberTotal: { totalScore: number; sends: number; flashes: number; attempts: number; problemsRecorded: number };
}
export interface ResultIdentity { competitionId: string; climberId: string; routeId: string }
export interface SaveResultInput { attempts: number; sent: boolean }

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const sameId = (value: unknown, expected: string) => id(value) && value.toLowerCase() === expected.toLowerCase();
function scoring(value: unknown): boolean {
  return object(value) && integer(value.deductionPercent, 99) && integer(value.maxAttempts, SCORING_ATTEMPTS_MAX) && Number(value.maxAttempts) > 0 && typeof value.label === "string";
}
function climber(value: unknown): boolean {
  return object(value) && id(value._id) && (value.firstName === null || typeof value.firstName === "string") &&
    (value.lastName === null || typeof value.lastName === "string") && typeof value.registrationStatus === "string" &&
    (value.division === null || (object(value.division) && id(value.division._id) && typeof value.division.name === "string"));
}
function route(value: unknown): boolean {
  return object(value) && id(value._id) && typeof value.routeNumber === "string" && typeof value.grade === "string" &&
    (value.name === null || typeof value.name === "string") && (value.pointValue === null || integer(value.pointValue, 10000));
}
const competitionPath = (competitionId: string) => "/api/gym-admin/competitions/" + encodeURIComponent(competitionId);
function entryPath(ids: ResultIdentity) {
  return competitionPath(ids.competitionId) + "/climbers/" + encodeURIComponent(ids.climberId) + "/routes/" + encodeURIComponent(ids.routeId);
}
function request<T>(path: string, signal?: AbortSignal, method: "GET" | "PUT" | "POST" = "GET", body?: unknown) {
  return withAccessToken(token => apiRequest<T>(path, { method, signal, ...(body !== undefined ? { body } : {}), headers: { Authorization: "Bearer " + token } }));
}
export async function getResultOptions(competitionId: string, signal?: AbortSignal): Promise<ResultOptions> {
  const value = await request<ResultOptions>(competitionPath(competitionId) + "/results/options", signal);
  if (!value || !value.competition || !sameId(value.competition._id, competitionId) || typeof value.competition.name !== "string" || typeof value.competition.date !== "string" || typeof value.competition.status !== "string" ||
    !value.canRecord || typeof value.canRecord.allowed !== "boolean" || !Array.isArray(value.canRecord.reasons) || value.canRecord.reasons.some(reason => typeof reason !== "string") ||
    !Array.isArray(value.climbers) || value.climbers.some(item => !climber(item) || item.registrationStatus !== "CONFIRMED") ||
    !Array.isArray(value.routes) || value.routes.some(item => !route(item)) ||
    (value.scoring !== null && (!scoring(value.scoring) || !value.scoring.records || ["attempts", "sends", "flash"].some(key => typeof value.scoring?.records[key as keyof typeof value.scoring.records] !== "boolean"))) ||
    (value.canRecord.allowed && !value.scoring)) throw new Error("The result entry options were incomplete.");
  return value;
}
function checkedEntry(value: ResultEntry, ids: ResultIdentity, requireResult = false): ResultEntry {
  if (!value || !sameId(value.competitionId, ids.competitionId) || !climber(value.climber) || !sameId(value.climber._id, ids.climberId) ||
    !route(value.route) || !sameId(value.route._id, ids.routeId) || (value.scoring !== null && !scoring(value.scoring)) ||
    !integer(value.attemptsLeft, SCORING_ATTEMPTS_MAX) || !value.climberTotal ||
    ["totalScore", "sends", "flashes", "attempts", "problemsRecorded"].some(key => !integer(value.climberTotal[key as keyof typeof value.climberTotal]))) throw new Error("The result response did not match the selected entry.");
  const result = value.result;
  if (result === null && !requireResult) return value;
  if (!result || !id(result.resultId) || !sameId(result.competitionId, ids.competitionId) || !sameId(result.climberId, ids.climberId) || !sameId(result.routeId, ids.routeId) ||
    !integer(result.attempts, SCORING_ATTEMPTS_MAX) || typeof result.sent !== "boolean" || result.sends !== (result.sent ? 1 : 0) ||
    (result.sent && result.attempts === 0) || result.flash !== (result.sent && result.attempts === 1) || !integer(result.officialScore)) throw new Error("The official result was not confirmed for the selected entry.");
  return value;
}
export async function getOfficialResult(ids: ResultIdentity, signal?: AbortSignal) {
  return checkedEntry(await request<ResultEntry>(entryPath(ids) + "/result", signal), ids);
}
export async function saveOfficialResult(ids: ResultIdentity, input: SaveResultInput, signal?: AbortSignal) {
  const body = { attempts: input.attempts, sent: input.sent };
  const value = checkedEntry(await request<ResultEntry>(entryPath(ids) + "/result", signal, "PUT", body), ids, true);
  if (value.result?.attempts !== input.attempts || value.result.sent !== input.sent) throw new Error("The saved result did not confirm the submitted values.");
  return value;
}
export async function recordOfficialAttempt(ids: ResultIdentity, sent: boolean, signal?: AbortSignal) {
  const value = checkedEntry(await request<ResultEntry>(entryPath(ids) + "/attempts", signal, "POST", { sent }), ids, true);
  if (!value.result || value.result.attempts < 1 || value.result.sent !== sent) throw new Error("The attempt was not confirmed.");
  return value;
}
