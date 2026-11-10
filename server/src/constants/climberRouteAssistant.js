/**
 * The Climber AI Route Assistant (US-033, FR-012, section 11 of the spec), the chatbot on My
 * scorecard and the leaderboard. It suggests which unfinished problems a Climber could try and
 * explains their scorecard and how far they are from other places, from official results, route
 * statistics and the current standings. It's read-only: it never changes official scores, results,
 * rankings, winners, or route grades, and never promises a place.
 */

/** The shortest and longest question accepted, in characters. */
export const CLIMBER_ASSISTANT_QUESTION_MIN_LENGTH = 3;
export const CLIMBER_ASSISTANT_QUESTION_MAX_LENGTH = 300;

/** Questions one Climber can ask per hour, across their competitions. Each one costs an AI call. */
export const CLIMBER_ASSISTANT_QUESTIONS_PER_HOUR = 20;

/** The most routes one answer recommends. */
export const CLIMBER_ASSISTANT_MAX_RECOMMENDED_ROUTES = 3;

/** What the page shows with every answer. */
export const CLIMBER_ASSISTANT_NOTICE =
  "AI-generated. May be inaccurate. Official scores are not affected. Other Climbers' results can still change the standings, so no answer guarantees a place.";
