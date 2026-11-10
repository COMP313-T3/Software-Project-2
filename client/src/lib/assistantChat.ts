import type { RouteToTry } from "./climberAssistantApi.ts";

/** The pages a Climber's chatbot is on, as the API names them. */
export type ClimberChatPage = "scorecard" | "leaderboard";

/** The pages a Gym Administrator's chatbot is on, as the API names them. */
export type GymAdminChatPage = "route-statistics" | "results" | "leaderboard";

/** Where a chatbot is: whose it is, and the page it opens on. */
export type ChatPlace =
  { audience: "climber"; page: ClimberChatPage } | { audience: "gym-admin"; page: GymAdminChatPage };

/** One message of a conversation, as the chatbot shows it. */
export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** The routes the answer recommends, which the API checked the Climber can still score on. */
  routes?: RouteToTry[];
  /** True when the answer was cut short. */
  truncated?: boolean;
}

/** An earlier message as the API takes it with a new question. */
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  text: string;
}

interface ChatText {
  /** The page's name, as the chatbot shows it under its title. */
  pageName: string;
  /** What to ask here, shown above the suggested questions. */
  intro: string;
  /** The first-time tips. */
  welcome: string[];
  /** Questions a click sends. */
  suggestions: string[];
}

const SUGGESTION_TIP = "Choose a suggested question to send it, or type your own.";

const CLIMBER_KNOWS =
  "It already knows this competition, your results and your division's standings, so you don't need to explain them.";
const CLIMBER_LIMITS = "It only gives suggestions. It can't change scores, results or rankings.";
const GYM_ADMIN_LIMITS =
  "It only explains. It can't change scores, results, rankings or route grades, and it never names a Climber.";

const CLIMBER_TEXT: Record<ClimberChatPage, ChatText> = {
  scorecard: {
    pageName: "My scorecard",
    intro: "Ask which problem to try next, or what your scorecard means.",
    welcome: [
      CLIMBER_KNOWS,
      `Ask which problem to try next, or what your scorecard means. ${SUGGESTION_TIP}`,
      CLIMBER_LIMITS,
    ],
    suggestions: [
      "Which route should I try next?",
      "Which unfinished route has the best completion rate?",
      "What route looks the easiest?",
      "Explain my scorecard.",
    ],
  },
  leaderboard: {
    pageName: "Live leaderboard",
    intro: "Ask where you stand, or how far another place is.",
    welcome: [CLIMBER_KNOWS, `Ask where you stand, or how far another place is. ${SUGGESTION_TIP}`, CLIMBER_LIMITS],
    suggestions: [
      "How far am I from the next rank?",
      "What is my current ranking?",
      "How many points separate me from rank 3?",
      "Explain the leaderboard to me.",
    ],
  },
};

const GYM_ADMIN_TEXT: Record<GymAdminChatPage, ChatText> = {
  "route-statistics": {
    pageName: "Route statistics",
    intro: "Ask how the problems performed.",
    welcome: [
      "It already knows this competition and its official route statistics, so you don't need to explain them.",
      `Ask how the problems performed. ${SUGGESTION_TIP}`,
      GYM_ADMIN_LIMITS,
    ],
    suggestions: [
      "Which route was the hardest?",
      "Which route had the lowest completion rate?",
      "Which route had the highest flash rate?",
      "Summarize the route statistics.",
    ],
  },
  results: {
    pageName: "Result entry",
    intro: "Ask how the problems are going as results come in.",
    welcome: [
      "It already knows this competition and its official route statistics, so you don't need to explain them.",
      `Ask how the problems are going as results come in. ${SUGGESTION_TIP}`,
      GYM_ADMIN_LIMITS,
    ],
    suggestions: [
      "Which route took the most attempts?",
      "Which routes look harder than their grade?",
      "Which routes have too few results to compare?",
      "Summarize the route performance for this competition.",
    ],
  },
  leaderboard: {
    pageName: "Live leaderboard",
    intro: "Ask how the competition is going behind the standings.",
    welcome: [
      "It already knows this competition, its route statistics, and each division's places and totals, so you don't need to explain them.",
      `Ask how the competition is going behind the standings. ${SUGGESTION_TIP}`,
      GYM_ADMIN_LIMITS,
    ],
    suggestions: [
      "How close is the race in each division?",
      "Which division has the highest scores?",
      "Which routes did the fewest Climbers top?",
      "Summarize the competition so far.",
    ],
  },
};

/**
 * What a chatbot says on its page: the page's name, what to ask, the first-time tips and the
 * suggested questions (section 11 of the spec).
 *
 * @param place Whose chatbot it is, and the page it's on.
 */
export function chatText(place: ChatPlace): ChatText {
  return place.audience === "climber" ? CLIMBER_TEXT[place.page] : GYM_ADMIN_TEXT[place.page];
}

/** The most messages kept for one conversation. Older ones are dropped. */
export const CHAT_MESSAGES_KEPT = 60;

/** The most earlier messages sent with a question. The API uses the last few of them. */
export const CHAT_HISTORY_SENT = 20;

/**
 * Conversations stay while the user stays in TopSend, so a chatbot shows the same conversation
 * again after a visit to another page. They are kept in memory only: nothing is saved to the
 * browser's storage or the server, and a reload starts fresh.
 */
const conversations = new Map<string, ChatMessage[]>();

/** Welcomes shown while the browser's storage can't be used, so each still shows once. */
const welcomed = new Set<string>();

const WELCOME_KEY = "topsend.assistant.welcomed";

/**
 * The key of one conversation: a user's, about one competition, on one kind of page.
 *
 * @param userId The logged-in user.
 * @param place Whose chatbot it is, and the page it's on.
 * @param competitionId The competition.
 */
export function conversationKey(userId: string, place: ChatPlace, competitionId: string) {
  return [userId, place.audience, place.page, competitionId].join(":");
}

export function readConversation(key: string): ChatMessage[] {
  return conversations.get(key) ?? [];
}

export function saveConversation(key: string, messages: ChatMessage[]) {
  conversations.set(key, messages.slice(-CHAT_MESSAGES_KEPT));
}

/** Forgets every conversation and welcome kept in memory. Tests call it between cases. */
export function forgetConversations() {
  conversations.clear();
  welcomed.clear();
}

/**
 * The earlier messages to send with a new question, oldest first.
 *
 * @param messages The conversation so far.
 */
export function historyOf(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages.slice(-CHAT_HISTORY_SENT).map(({ role, text }) => ({ role, text }));
}

function welcomeId(userId: string, place: ChatPlace) {
  return [userId, place.audience, place.page].join(":");
}

function storedWelcomes(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(WELCOME_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Whether the first-time welcome was already shown to this user on this kind of page. It's
 * remembered in the browser, per user, so it's shown once on each device.
 *
 * @param userId The logged-in user.
 * @param place Whose chatbot it is, and the page it's on.
 */
export function wasWelcomed(userId: string, place: ChatPlace) {
  const id = welcomeId(userId, place);
  return welcomed.has(id) || storedWelcomes().includes(id);
}

/**
 * Remembers that the welcome was shown, so it isn't shown again.
 *
 * @param userId The logged-in user.
 * @param place Whose chatbot it is, and the page it's on.
 */
export function rememberWelcome(userId: string, place: ChatPlace) {
  const id = welcomeId(userId, place);
  welcomed.add(id);
  try {
    const stored = storedWelcomes();
    if (!stored.includes(id)) window.localStorage.setItem(WELCOME_KEY, JSON.stringify([...stored, id].slice(-200)));
  } catch {
    return;
  }
}
