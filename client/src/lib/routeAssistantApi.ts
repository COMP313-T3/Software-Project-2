import { ApiError, apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface RouteAssistantRoute {
  route: string;
  name?: string;
  grade: string;
  climbersWithResults: number;
  sends: number;
  flashes: number;
  completionRatePercent: number | null;
  averageAttempts: number | null;
  flashRatePercent: number | null;
  enoughData: boolean;
}

export interface RouteAssistantSources {
  division: { _id: string; name: string } | null;
  routes: RouteAssistantRoute[];
  resultCount: number;
  routesLeftOut: number;
  minimumResultsForComparison: number;
}

interface Context {
  competition: { _id: string; name: string };
  notice: string;
  basedOn: RouteAssistantSources;
}

export interface RouteAssistantAvailability extends Context {
  enabled: boolean;
  canAsk: boolean;
  reasons: string[];
  limits: { questionMaxLength: number; questionsPerHour: number };
}

export interface RouteAssistantAnswer extends Context {
  question: string;
  answer: string;
  answeredAt: string;
  truncated: boolean;
}

const path = (competitionId: string) =>
  `/api/gym-admin/competitions/${encodeURIComponent(competitionId)}/route-assistant`;

/** Match the server's spacing and length rules, including for questions in other languages. */
export function normalizeRouteQuestion(question: string) {
  return question.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function routeQuestionProblem(question: string, maxLength: number) {
  if (question.length < 3 || question.length > maxLength) {
    return `Use 3 to ${maxLength} characters for your question.`;
  }
  if (!/\p{L}/u.test(question)) return "Enter a question about how the routes performed.";
  if (Array.from(question).some(char => {
    const code = char.charCodeAt(0);
    return code < 32 && code !== 10 || code === 127;
  })) return "Remove the special characters from your question.";
  return "";
}

const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const metric = (value: number | null, max = Infinity) =>
  value === null || (Number.isFinite(value) && value >= 0 && value <= max);

function hasContext(value: Context | undefined, competitionId: string) {
  if (!value || value.competition?._id !== competitionId.toLowerCase() ||
      !text(value.competition.name) || !text(value.notice)) return false;
  const data = value.basedOn;
  return !!data && count(data.resultCount) && count(data.routesLeftOut) &&
    count(data.minimumResultsForComparison) && data.minimumResultsForComparison > 0 &&
    (data.division === null || (text(data.division?._id) && text(data.division.name))) &&
    Array.isArray(data.routes) && data.routes.every(route =>
      route && text(route.route) && text(route.grade) &&
      (route.name === undefined || text(route.name)) &&
      count(route.climbersWithResults) && count(route.sends) && count(route.flashes) &&
      metric(route.completionRatePercent, 100) && metric(route.averageAttempts) &&
      metric(route.flashRatePercent, 100) && typeof route.enoughData === "boolean"
    );
}

export async function getRouteAssistant(competitionId: string, signal?: AbortSignal) {
  const data = await withAccessToken(token => apiRequest<RouteAssistantAvailability>(path(competitionId), {
    signal, headers: { Authorization: `Bearer ${token}` },
  }));
  if (!hasContext(data, competitionId) ||
      typeof data.enabled !== "boolean" || typeof data.canAsk !== "boolean" ||
      !Array.isArray(data.reasons) || !data.reasons.every(text) ||
      !count(data.limits?.questionMaxLength) || data.limits.questionMaxLength < 3 ||
      !count(data.limits.questionsPerHour) || data.limits.questionsPerHour < 1) {
    throw new Error("Invalid route assistant availability.");
  }
  return data;
}

/** US-023 → FR-012. The server chooses the official statistics; the browser sends only the question. */
export async function askRouteAssistant(competitionId: string, question: string, signal?: AbortSignal) {
  const normalized = normalizeRouteQuestion(question);
  const data = await withAccessToken(token => apiRequest<RouteAssistantAnswer>(path(competitionId), {
    method: "POST", body: { question: normalized }, signal,
    headers: { Authorization: `Bearer ${token}` },
    // Allow for the backend's 30 second model timeout and time spent reading the database.
    timeoutMs: 40_000,
  }));
  if (!hasContext(data, competitionId) || data.question !== normalized ||
      !text(data.answer) || typeof data.truncated !== "boolean" ||
      !text(data.answeredAt) || !Number.isFinite(Date.parse(data.answeredAt))) {
    throw new Error("Invalid route assistant answer.");
  }
  return data;
}

export function assistantAccessLost(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

export function routeAssistantProblem(error: unknown, action: "load" | "ask") {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Sign in again to continue.";
    if (error.status === 403) return "You don't have access to the assistant for this competition.";
    if (error.status === 404) return "This competition isn't available to your account.";
    if (error.status === 429) return "You've reached the hourly question limit. Try again later.";
    switch (error.code) {
      case "ROUTE_ASSISTANT_NO_DATA":
        return "There are no official results to explain right now. Refresh the competition data.";
      case "ROUTE_ASSISTANT_UNAVAILABLE":
        return "The Route Assistant is unavailable right now. Try again later.";
      case "ROUTE_ASSISTANT_BUSY":
        return "The Route Assistant is busy. Wait a moment before trying again.";
      case "ROUTE_ASSISTANT_DECLINED":
        return "The assistant couldn't answer that question. Try asking how the competition's routes performed.";
      case "TIMEOUT":
        return "The request took too long. Please try again.";
      case "NETWORK_ERROR":
        return "Couldn't reach TopSend. Check your connection and try again.";
    }
  }
  return action === "load"
    ? "Couldn't load the Route Assistant. Please try again."
    : "Couldn't get an answer. Please try again.";
}
