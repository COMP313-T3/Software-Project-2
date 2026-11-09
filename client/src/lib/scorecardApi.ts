import { ApiError, apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** Where the Climber stands on one problem. FLASHED and SENT are completed; the others are not. */
export type ScorecardRouteStatus = "FLASHED" | "SENT" | "ATTEMPTED" | "NOT_ATTEMPTED";

export interface ScorecardResult {
  attempts: number;
  sends: 0 | 1;
  sent: boolean;
  flash: boolean;
  officialScore: number;
  attemptsLeft: number;
  updatedAt: string | null;
}

export interface ScorecardRoute {
  routeId: string;
  routeNumber: string;
  name: string | null;
  grade: string;
  pointValue: number | null;
  status: ScorecardRouteStatus;
  statusLabel: string;
  completed: boolean;
  result: ScorecardResult | null;
}

/** Why the Climber can't record results right now, when scoring isn't open. */
export type SelfScoringReason = "CANCELLED" | "NOT_STARTED" | "CLOSED" | "NO_SCORING" | "NOT_CONFIRMED";

/** The Climber's whole result on one problem, as they record it: attempts, and whether the last one topped it. */
export interface ResultChange {
  attempts: number;
  sent: boolean;
}

export interface Scorecard {
  competition: {
    _id: string;
    name: string;
    date: string;
    location: string | null;
    status: "PUBLISHED" | "CANCELLED";
    upcoming: boolean;
    gym: { _id: string; name: string; active: boolean } | null;
  };
  registration: {
    registrationId: string;
    status: "CONFIRMED" | "WAITLIST" | "PENDING";
    statusLabel: string;
    confirmed: boolean;
    division: { _id: string; name: string } | null;
  };
  scoring: { deductionPercent: number; maxAttempts: number; label: string } | null;
  summary: {
    routeCount: number;
    completed: number;
    unfinished: number;
    flashes: number;
    attempted: number;
    notAttempted: number;
    totalAttempts: number;
    totalScore: number;
  };
  selfScoring: { open: boolean; reason: SelfScoringReason | null };
  routes: ScorecardRoute[];
  lastResultAt: string | null;
  generatedAt: string;
}

const STATUSES: readonly ScorecardRouteStatus[] = ["FLASHED", "SENT", "ATTEMPTED", "NOT_ATTEMPTED"];
const SELF_SCORING_REASONS: readonly SelfScoringReason[] = ["CANCELLED", "NOT_STARTED", "CLOSED", "NO_SCORING", "NOT_CONFIRMED"];
const COMPLETED: readonly ScorecardRouteStatus[] = ["FLASHED", "SENT"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const isCalendarDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const isNamed = (value: unknown): boolean => isObject(value) && isText(value._id) && isText(value.name);

function isResult(value: unknown): value is ScorecardResult {
  return (
    isObject(value) &&
    isCount(value.attempts) &&
    (value.sends === 0 || value.sends === 1) &&
    value.sent === (value.sends === 1) &&
    typeof value.flash === "boolean" &&
    isCount(value.officialScore) &&
    isCount(value.attemptsLeft) &&
    (value.updatedAt === null || isTimestamp(value.updatedAt))
  );
}

function isRoute(value: unknown): value is ScorecardRoute {
  if (!isObject(value)) return false;
  const status = value.status as ScorecardRouteStatus;
  return (
    isText(value.routeId) &&
    isText(value.routeNumber) &&
    (value.name === null || typeof value.name === "string") &&
    isText(value.grade) &&
    (value.pointValue === null || isCount(value.pointValue)) &&
    STATUSES.includes(status) &&
    isText(value.statusLabel) &&
    value.completed === COMPLETED.includes(status) &&
    (value.result === null ? status === "NOT_ATTEMPTED" : isResult(value.result))
  );
}

function hasCompetition(value: Record<string, unknown>, competitionId: string): boolean {
  const competition = value.competition;
  return (
    isObject(competition) &&
    competition._id === competitionId &&
    isText(competition.name) &&
    isCalendarDate(competition.date) &&
    (competition.location === null || typeof competition.location === "string") &&
    (competition.status === "PUBLISHED" || competition.status === "CANCELLED") &&
    typeof competition.upcoming === "boolean" &&
    (competition.gym === null || (isNamed(competition.gym) && typeof (competition.gym as Record<string, unknown>).active === "boolean"))
  );
}

function hasRegistration(value: Record<string, unknown>): boolean {
  const registration = value.registration;
  return (
    isObject(registration) &&
    isText(registration.registrationId) &&
    ["CONFIRMED", "WAITLIST", "PENDING"].includes(registration.status as string) &&
    isText(registration.statusLabel) &&
    registration.confirmed === (registration.status === "CONFIRMED") &&
    (registration.division === null || isNamed(registration.division))
  );
}

function hasScoring(value: Record<string, unknown>): boolean {
  const scoring = value.scoring;
  return (
    scoring === null ||
    (isObject(scoring) &&
      isCount(scoring.deductionPercent) &&
      isCount(scoring.maxAttempts) &&
      scoring.maxAttempts > 0 &&
      isText(scoring.label))
  );
}

function hasSelfScoring(value: Record<string, unknown>): boolean {
  const selfScoring = value.selfScoring;
  if (!isObject(selfScoring)) return false;
  return selfScoring.open === true
    ? selfScoring.reason === null
    : selfScoring.open === false && SELF_SCORING_REASONS.includes(selfScoring.reason as SelfScoringReason);
}

function hasSummary(value: Record<string, unknown>, routes: unknown[]): boolean {
  const summary = value.summary;
  return (
    isObject(summary) &&
    ["routeCount", "completed", "unfinished", "flashes", "attempted", "notAttempted", "totalAttempts", "totalScore"].every(
      (key) => isCount(summary[key]),
    ) &&
    summary.routeCount === routes.length &&
    Number(summary.completed) + Number(summary.unfinished) === routes.length
  );
}

/**
 * Checks a scorecard from the API or a live update before it replaces what the page shows, so a
 * response for another competition, or one with missing or repeated problems, is never displayed.
 *
 * @param value The parsed response or update.
 * @param competitionId The competition the page is showing.
 * @returns The scorecard.
 * @throws {Error} When it is incomplete or belongs to another competition.
 */
export function checkedScorecard(value: unknown, competitionId: string): Scorecard {
  if (
    !isObject(value) ||
    !hasCompetition(value, competitionId) ||
    !hasRegistration(value) ||
    !hasScoring(value) ||
    !hasSelfScoring(value) ||
    !Array.isArray(value.routes) ||
    !hasSummary(value, value.routes) ||
    !(value.lastResultAt === null || isTimestamp(value.lastResultAt)) ||
    !isTimestamp(value.generatedAt)
  ) {
    throw new Error("The scorecard response was incomplete or did not match this competition.");
  }
  const routeIds = new Set<string>();
  for (const route of value.routes) {
    if (!isRoute(route) || routeIds.has(route.routeId)) {
      throw new Error("The scorecard contained an invalid or repeated problem.");
    }
    routeIds.add(route.routeId);
  }
  return value as unknown as Scorecard;
}

/**
 * Loads the logged-in Climber's own scorecard for one competition (US-031). The Climber comes from
 * the access token, so no request can ask for someone else's.
 *
 * @param competitionId The competition.
 * @param signal Cancels the request.
 * @returns The checked scorecard.
 * @throws {ApiError} 404 REGISTRATION_NOT_FOUND when the Climber isn't registered, or
 *   COMPETITION_NOT_FOUND when the competition isn't available.
 */
export async function getScorecard(competitionId: string, signal?: AbortSignal): Promise<Scorecard> {
  const path = `/api/competitions/${encodeURIComponent(competitionId)}/scorecard`;
  const value = await withAccessToken((token) =>
    apiRequest<unknown>(path, { signal, headers: { Authorization: `Bearer ${token}` } }),
  );
  return checkedScorecard(value, competitionId);
}

function resultPath(competitionId: string, routeId: string): string {
  return `/api/competitions/${encodeURIComponent(competitionId)}/scorecard/routes/${encodeURIComponent(routeId)}/result`;
}

/**
 * Saves the logged-in Climber's own result on one problem (US-031), replacing any saved one. The
 * server works out the flash and the points.
 *
 * @param competitionId The competition.
 * @param routeId The problem.
 * @param change The attempts, and whether the last one topped it.
 * @returns The Climber's checked, updated scorecard.
 * @throws {ApiError} 409 when scoring isn't open, 400 for attempts above the competition's maximum.
 */
export async function saveMyResult(competitionId: string, routeId: string, change: ResultChange): Promise<Scorecard> {
  const value = await withAccessToken((token) =>
    apiRequest<unknown>(resultPath(competitionId, routeId), {
      method: "PUT",
      body: { attempts: change.attempts, sent: change.sent },
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  return checkedScorecard(value, competitionId);
}

/**
 * Clears the logged-in Climber's own result on one problem (US-031).
 *
 * @param competitionId The competition.
 * @param routeId The problem.
 * @returns The Climber's checked, updated scorecard.
 * @throws {ApiError} 404 RESULT_NOT_FOUND when there's nothing to clear, 409 when scoring isn't open.
 */
export async function clearMyResult(competitionId: string, routeId: string): Promise<Scorecard> {
  const value = await withAccessToken((token) =>
    apiRequest<unknown>(resultPath(competitionId, routeId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  return checkedScorecard(value, competitionId);
}

function sameResult(a: ScorecardResult | null, b: ScorecardResult | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.attempts === b.attempts &&
    a.sends === b.sends &&
    a.flash === b.flash &&
    a.officialScore === b.officialScore &&
    a.attemptsLeft === b.attemptsLeft
  );
}

/**
 * The problems whose status or result differs between two versions of a scorecard,
 * including problems that were added. Used to point out what a live update changed.
 *
 * @param previous The scorecard shown before.
 * @param next The scorecard that replaces it.
 * @returns The route IDs that changed, in the order of the new scorecard.
 */
export function changedRouteIds(previous: Scorecard, next: Scorecard): string[] {
  const before = new Map(previous.routes.map((route) => [route.routeId, route]));
  return next.routes
    .filter((route) => {
      const old = before.get(route.routeId);
      return !old || old.status !== route.status || !sameResult(old.result, route.result);
    })
    .map((route) => route.routeId);
}

/**
 * Whether two scorecards show the same thing, ignoring when each was generated.
 *
 * @param a One scorecard.
 * @param b The other.
 */
export function sameScorecard(a: Scorecard, b: Scorecard): boolean {
  return JSON.stringify({ ...a, generatedAt: "" }) === JSON.stringify({ ...b, generatedAt: "" });
}

/**
 * A message for a scorecard that couldn't be loaded. The API's own messages for 4xx answers are
 * written for users, so those are shown as they are.
 *
 * @param error What went wrong.
 * @returns A message that is safe to show.
 */
export function scorecardProblem(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Your session has expired. Sign in again to view your scorecard.";
  }
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return error.message;
  return "Couldn't load your scorecard. Please try again.";
}

/**
 * A message for a result that couldn't be saved. The API's own messages for 4xx answers explain
 * what to do, so those are shown as they are.
 *
 * @param error What went wrong.
 * @returns A message that is safe to show.
 */
export function recordProblem(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Your session has expired. Sign in again to record your results.";
  }
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return error.message;
  return "Couldn't save your result. Check your connection and try again.";
}
