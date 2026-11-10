import { apiRequest, ApiError } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** US-020 / #173, #174 -> FR-011 -> AC-016. Ranks and scores are server-owned. */
export type LeaderboardAudience = "manage" | "climber" | "public";
export interface Standing {
  entryId: string; rank: number; tied: boolean;
  climber: { _id?: string; firstName: string | null; lastName: string | null };
  totalScore: number; sends: number; flashes: number; attemptsToTops: number; problemsRecorded: number;
}
export interface LeaderboardDivision { _id: string; name: string; climberCount: number; standings: Standing[] }
export type RegistrationStatus = "CONFIRMED" | "PENDING" | "WAITLIST";
/** US-032: the logged-in Climber's own place, with how far they are behind the leader and the place above theirs. */
export interface MyEntry {
  entryId: string; division: { _id: string; name: string }; rank: number; tied: boolean; totalScore: number; of: number;
  sends: number; flashes: number; problemsRecorded: number; pointsBehindLeader: number;
  placeAbove: { rank: number; pointsBehind: number } | null;
}
/** US-032: the Climber's registration, so a Climber who isn't ranked can be told why. */
export interface MyRegistration { status: RegistrationStatus; division: { _id: string; name: string } | null }
export interface Leaderboard {
  audience: LeaderboardAudience;
  competition: {
    _id: string; name: string; date: string; status: string; gym: { _id: string; name: string } | null; publicLeaderboard?: boolean;
    /** When it starts and ends, and whether the server says it has ended. The page counts down to the end while it's on. */
    startsAt?: string; endTime?: string | null; endsAt?: string; ended?: boolean;
  };
  scoring: { deductionPercent: number; maxAttempts: number; label: string } | null;
  tiebreakers: string[]; routeCount: number; divisions: LeaderboardDivision[];
  myEntry?: MyEntry | null; myRegistration?: MyRegistration | null;
  lastResultAt: string | null; generatedAt: string;
}
const REGISTRATION_STATUSES = new Set<unknown>(["CONFIRMED", "PENDING", "WAITLIST"]);
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object";
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const timestamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
function standing(v: unknown, audience: LeaderboardAudience): v is Standing {
  return object(v) && text(v.entryId) && count(v.rank) && v.rank > 0 && typeof v.tied === "boolean" && object(v.climber) &&
    [v.climber.firstName, v.climber.lastName].every(name => name === null || typeof name === "string") &&
    (audience === "manage" ? text(v.climber._id) : v.climber._id === undefined) &&
    [v.totalScore, v.sends, v.flashes, v.attemptsToTops, v.problemsRecorded].every(count);
}
/** Validate both REST and socket snapshots before replacing the selected competition's table. */
export function checkedLeaderboard(value: unknown, competitionId: string, audience: LeaderboardAudience): Leaderboard {
  if (!object(value) || value.audience !== audience || !object(value.competition) || value.competition._id !== competitionId ||
    !text(value.competition.name) || !text(value.competition.date) || !text(value.competition.status) ||
    !(value.competition.gym === null || (object(value.competition.gym) && text(value.competition.gym._id) && text(value.competition.gym.name))) ||
    (audience === "manage" ? typeof value.competition.publicLeaderboard !== "boolean" : value.competition.publicLeaderboard !== undefined) ||
    !count(value.routeCount) || !timestamp(value.generatedAt) || !(value.lastResultAt === null || timestamp(value.lastResultAt)) ||
    !Array.isArray(value.tiebreakers) || !value.tiebreakers.every(text) ||
    !(value.scoring === null || (object(value.scoring) && count(value.scoring.deductionPercent) && value.scoring.deductionPercent <= 99 && count(value.scoring.maxAttempts) && value.scoring.maxAttempts > 0 && value.scoring.maxAttempts <= 20 && text(value.scoring.label))) ||
    !Array.isArray(value.divisions)) throw new Error("The leaderboard response was incomplete or did not match this competition.");
  const divisionIds = new Set<string>(), entryIds = new Set<string>();
  for (const division of value.divisions) {
    if (!object(division) || !text(division._id) || divisionIds.has(division._id) || !text(division.name) || !count(division.climberCount) ||
      !Array.isArray(division.standings) || division.climberCount !== division.standings.length) throw new Error("The division standings were incomplete.");
    divisionIds.add(division._id);
    for (const item of division.standings) {
      if (!standing(item, audience) || entryIds.has(item.entryId)) throw new Error("The standings contained an invalid or repeated entry.");
      entryIds.add(item.entryId);
    }
  }
  if (audience === "climber") {
    const mine = value.myEntry;
    if (mine !== null && (!object(mine) || !text(mine.entryId) || !object(mine.division) || !text(mine.division._id) || !text(mine.division.name) ||
      !count(mine.rank) || mine.rank === 0 || !count(mine.of) || mine.of < mine.rank || !count(mine.totalScore) || typeof mine.tied !== "boolean")) throw new Error("The Climber's position was incomplete.");
    if (mine !== null && (![mine.sends, mine.flashes, mine.problemsRecorded, mine.pointsBehindLeader].every(count) ||
      !(mine.placeAbove === null || (object(mine.placeAbove) && count(mine.placeAbove.rank) && mine.placeAbove.rank > 0 && mine.placeAbove.rank < Number(mine.rank) && count(mine.placeAbove.pointsBehind) && mine.placeAbove.pointsBehind > 0)))) throw new Error("The Climber's position was incomplete.");
    const registration = value.myRegistration;
    if (registration !== null && (!object(registration) || !REGISTRATION_STATUSES.has(registration.status) ||
      !(registration.division === null || (object(registration.division) && text(registration.division._id) && text(registration.division.name))))) throw new Error("The Climber's registration was incomplete.");
  } else if (value.myEntry !== undefined || value.myRegistration !== undefined) throw new Error("The leaderboard audience did not match this page.");
  return value as unknown as Leaderboard;
}
export async function getLeaderboard(competitionId: string, audience: LeaderboardAudience, signal?: AbortSignal): Promise<Leaderboard> {
  const prefix = audience === "manage" ? "/api/gym-admin/competitions/" : audience === "climber" ? "/api/competitions/" : "/api/leaderboards/";
  const path = prefix + encodeURIComponent(competitionId) + (audience === "public" ? "" : "/leaderboard");
  const value = audience === "public" ? await apiRequest<unknown>(path, { signal }) : await withAccessToken(token => apiRequest<unknown>(path, { signal, headers: { Authorization: "Bearer " + token } }));
  return checkedLeaderboard(value, competitionId, audience);
}
export const leaderboardName = (entry: Standing) => [entry.climber.firstName, entry.climber.lastName].filter(Boolean).join(" ") || "Climber";
export function leaderboardProblem(error: unknown, fallback = "Couldn't load the leaderboard. Please try again.") {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : fallback;
}
