/**
 * The AI Route Assistant as a chatbot inside pages (US-023, US-033, section 11 of the spec). A
 * question carries the page it was asked on and the earlier messages of that page's conversation.
 */

/** The pages a Climber's chatbot is on. The first is the one a request without a page means. */
export const CLIMBER_ASSISTANT_PAGES = Object.freeze(["scorecard", "leaderboard"]);

/** The pages a Gym Administrator's chatbot is on. The first is the default. */
export const ROUTE_ASSISTANT_PAGES = Object.freeze(["route-statistics", "results", "leaderboard"]);

/** Who wrote an earlier message. */
export const ASSISTANT_HISTORY_ROLES = Object.freeze(["user", "assistant"]);

/** The most earlier messages a request can carry. More than this is refused. */
export const ASSISTANT_HISTORY_MAX_SENT = 20;

/**
 * The most recent earlier messages that go to the AI with a question: enough for a follow-up
 * question to make sense, without one conversation's size and cost growing with every question.
 */
export const ASSISTANT_HISTORY_MAX_USED = 6;

/** The longest earlier message a request can carry, in characters. A longer one is refused. */
export const ASSISTANT_HISTORY_TEXT_MAX_SENT = 8000;

/** How much of each earlier message goes to the AI, in characters. The rest is cut. */
export const ASSISTANT_HISTORY_TEXT_MAX_USED = 1000;

/**
 * The most places of one division that go to the AI with a Gym Administrator's question on the Live
 * leaderboard, from 1st place down. This only keeps one question's size and cost bounded.
 */
export const ASSISTANT_STANDINGS_MAX_PLACES = 30;
