import { ApiError, apiRequest } from "./apiClient.ts";
import { normalizeRouteQuestion } from "./routeAssistantApi.ts";
import { withAccessToken } from "./sessionClient.ts";

interface RouteLabel {
  route: string;
  name?: string;
  grade: string;
}

/** A route the Climber can still score on, with how it went for every Climber so far (US-022). */
export interface RouteToTry extends RouteLabel {
  points: number;
  yourAttempts: number;
  attemptsLeft: number;
  pointsIfToppedNextAttempt: number;
  climbersWithResults: number;
  completionRatePercent: number | null;
  averageAttempts: number | null;
  flashRatePercent: number | null;
  enoughData: boolean;
}

export interface CompletedRoute extends RouteLabel {
  attempts: number;
  flash: boolean;
  pointsEarned: number;
}

export interface UnscorableRoute extends RouteLabel {
  yourAttempts?: number;
  reason: "no point value yet" | "worth no points" | "no attempts left" | "competition is over";
}

export interface ClimberStanding {
  division: string;
  place: number;
  tied: boolean;
  climbersInDivision: number;
  totalScore: number;
  routesTopped: number;
  flashes: number;
  pointsBehindLeader: number;
}

export interface PlaceAbove {
  place: number;
  totalScore: number;
  pointsToTie: number;
}

export interface DivisionPlace {
  place: number;
  totalScore: number;
  climbers: number;
  yours?: true;
}

/** What the assistant answers from: the Climber's own data, and other Climbers only as places and totals. */
export interface ClimberAssistantData {
  competition: { name: string; date: string; finished: boolean };
  scoring: { deductionPercent: number; maxAttempts: number } | null;
  you: ClimberStanding | null;
  placesAbove: PlaceAbove[];
  divisionPlaces: DivisionPlace[];
  routesToTry: RouteToTry[];
  completedRoutes: CompletedRoute[];
  cantScore: UnscorableRoute[];
  minimumResultsForComparison: number;
}

interface Context {
  competition: {
    _id: string;
    name: string;
    date: string;
    gym: { _id: string; name: string } | null;
  };
  notice: string;
  basedOn: ClimberAssistantData;
}

export interface ClimberAssistantAvailability extends Context {
  enabled: boolean;
  canAsk: boolean;
  reasons: string[];
  limits: { questionMaxLength: number; questionsPerHour: number };
}

export interface ClimberAssistantAnswer extends Context {
  question: string;
  answer: string;
  recommendedRoutes: RouteToTry[];
  truncated: boolean;
  answeredAt: string;
}

const UNSCORABLE_REASONS: readonly string[] = [
  "no point value yet",
  "worth no points",
  "no attempts left",
  "competition is over",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isPlace = (value: unknown): value is number => isCount(value) && value > 0;
const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const isCalendarDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const isRate = (value: unknown, max = Infinity) =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max);
const isListOf = (value: unknown, check: (item: unknown) => boolean) => Array.isArray(value) && value.every(check);

function isLabel(value: Record<string, unknown>) {
  return isText(value.route) && isText(value.grade) && (value.name === undefined || isText(value.name));
}

function isRouteToTry(value: unknown): value is RouteToTry {
  return (
    isObject(value) &&
    isLabel(value) &&
    isCount(value.points) &&
    isCount(value.yourAttempts) &&
    isPlace(value.attemptsLeft) &&
    isCount(value.pointsIfToppedNextAttempt) &&
    isCount(value.climbersWithResults) &&
    isRate(value.completionRatePercent, 100) &&
    isRate(value.averageAttempts) &&
    isRate(value.flashRatePercent, 100) &&
    typeof value.enoughData === "boolean"
  );
}

function isCompletedRoute(value: unknown) {
  return (
    isObject(value) &&
    isLabel(value) &&
    isPlace(value.attempts) &&
    typeof value.flash === "boolean" &&
    isCount(value.pointsEarned)
  );
}

function isUnscorableRoute(value: unknown) {
  return (
    isObject(value) &&
    isLabel(value) &&
    (value.yourAttempts === undefined || isCount(value.yourAttempts)) &&
    UNSCORABLE_REASONS.includes(value.reason as string)
  );
}

function isStanding(value: unknown) {
  return (
    isObject(value) &&
    isText(value.division) &&
    isPlace(value.place) &&
    typeof value.tied === "boolean" &&
    isPlace(value.climbersInDivision) &&
    ["totalScore", "routesTopped", "flashes", "pointsBehindLeader"].every((key) => isCount(value[key]))
  );
}

function isData(value: unknown): value is ClimberAssistantData {
  if (!isObject(value)) return false;
  const { competition, scoring } = value;
  return (
    isObject(competition) &&
    isText(competition.name) &&
    isCalendarDate(competition.date) &&
    typeof competition.finished === "boolean" &&
    (scoring === null || (isObject(scoring) && isCount(scoring.deductionPercent) && isPlace(scoring.maxAttempts))) &&
    (value.you === null || isStanding(value.you)) &&
    isListOf(
      value.placesAbove,
      (place) => isObject(place) && isPlace(place.place) && isCount(place.totalScore) && isPlace(place.pointsToTie),
    ) &&
    isListOf(
      value.divisionPlaces,
      (place) =>
        isObject(place) &&
        isPlace(place.place) &&
        isCount(place.totalScore) &&
        isPlace(place.climbers) &&
        (place.yours === undefined || place.yours === true),
    ) &&
    isListOf(value.routesToTry, isRouteToTry) &&
    isListOf(value.completedRoutes, isCompletedRoute) &&
    isListOf(value.cantScore, isUnscorableRoute) &&
    isPlace(value.minimumResultsForComparison)
  );
}

function hasContext(value: unknown, competitionId: string): value is Context {
  if (!isObject(value) || !isObject(value.competition) || !isText(value.notice) || !isData(value.basedOn)) return false;
  const { competition } = value;
  return (
    competition._id === competitionId &&
    isText(competition.name) &&
    isCalendarDate(competition.date) &&
    (competition.gym === null ||
      (isObject(competition.gym) && isText(competition.gym._id) && isText(competition.gym.name)))
  );
}

const path = (competitionId: string) => `/api/competitions/${encodeURIComponent(competitionId)}/route-assistant`;

/**
 * Whether the logged-in Climber can ask the Route Assistant about one of their competitions, and
 * the data an answer would use (US-033).
 *
 * @param competitionId The competition, in lowercase.
 * @param signal Cancels the request.
 * @returns The checked availability.
 * @throws {ApiError} 404 when the Climber isn't registered or the competition isn't available.
 */
export async function getClimberAssistant(competitionId: string, signal?: AbortSignal) {
  const value = await withAccessToken((token) =>
    apiRequest<unknown>(path(competitionId), {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  if (
    !hasContext(value, competitionId) ||
    !isObject(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.canAsk !== "boolean" ||
    !isListOf(value.reasons, isText) ||
    (value.canAsk && (value.reasons as string[]).length > 0) ||
    !isObject(value.limits) ||
    !isCount(value.limits.questionMaxLength) ||
    value.limits.questionMaxLength < 3 ||
    !isPlace(value.limits.questionsPerHour)
  ) {
    throw new Error("The Route Assistant response was incomplete or did not match this competition.");
  }
  return value as unknown as ClimberAssistantAvailability;
}

/**
 * Asks the Route Assistant a question (US-033). Only the question is sent: the server reads the
 * Climber's official results and the standings itself.
 *
 * @param competitionId The competition, in lowercase.
 * @param question The question as typed.
 * @param signal Cancels the request.
 * @returns The checked answer.
 */
export async function askClimberAssistant(competitionId: string, question: string, signal?: AbortSignal) {
  const normalized = normalizeRouteQuestion(question);
  const value = await withAccessToken((token) =>
    apiRequest<unknown>(path(competitionId), {
      method: "POST",
      body: { question: normalized },
      signal,
      headers: { Authorization: `Bearer ${token}` },
      // The API waits up to 30 seconds for the AI, after reading the standings.
      timeoutMs: 40_000,
    }),
  );
  if (
    !hasContext(value, competitionId) ||
    !isObject(value) ||
    value.question !== normalized ||
    !isText(value.answer) ||
    typeof value.truncated !== "boolean" ||
    !isTimestamp(value.answeredAt) ||
    !isListOf(value.recommendedRoutes, isRouteToTry)
  ) {
    throw new Error("The Route Assistant answer was incomplete or did not match this competition.");
  }
  const available = new Set((value.basedOn as ClimberAssistantData).routesToTry.map((route) => route.route));
  const recommended = value.recommendedRoutes as RouteToTry[];
  if (recommended.length > 3 || recommended.some((route) => !available.has(route.route))) {
    throw new Error("The Route Assistant recommended a route the Climber can't score on.");
  }
  return value as unknown as ClimberAssistantAnswer;
}

/**
 * Why a question can't be sent yet, with the same rules and messages as the API, or "" when it
 * can be.
 *
 * @param question The normalized question.
 * @param maxLength The longest question the API accepts.
 */
export function climberQuestionProblem(question: string, maxLength: number) {
  if (question.length < 3 || question.length > maxLength) return `Use 3 to ${maxLength} characters.`;
  if (!/\p{L}/u.test(question)) return "Enter a question about the routes or your ranking.";
  if (
    Array.from(question).some((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && code !== 10) || code === 127;
    })
  ) {
    return "Remove the special characters from your question.";
  }
  return "";
}

/**
 * A message for a failed request that is safe to show. The API's own messages for 4xx answers,
 * such as the hourly limit or why the Climber can't ask, are shown as they are.
 *
 * @param error What went wrong.
 * @param action Whether the page was loading or asking.
 */
export function climberAssistantProblem(error: unknown, action: "load" | "ask") {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Sign in again to continue.";
    switch (error.code) {
      case "ROUTE_ASSISTANT_UNAVAILABLE":
        return "The Route Assistant isn't available right now. Your results are unchanged. Try again later.";
      case "ROUTE_ASSISTANT_BUSY":
        return "The Route Assistant is busy right now. Try again in a minute.";
      case "ROUTE_ASSISTANT_BAD_RESPONSE":
        return "The Route Assistant's answer couldn't be used. Try asking again.";
      case "ROUTE_ASSISTANT_DECLINED":
        return "The Route Assistant couldn't answer that question. Ask which route to try next or how far you are from a place.";
      case "TIMEOUT":
        return "The Route Assistant took too long to answer. Try again.";
      case "NETWORK_ERROR":
        return "Couldn't reach TopSend. Check your connection and try again.";
    }
    if (error.status >= 400 && error.status < 500) return error.message;
  }
  return action === "load"
    ? "Couldn't load the Route Assistant. Please try again."
    : "Couldn't get an answer. Please try again.";
}
