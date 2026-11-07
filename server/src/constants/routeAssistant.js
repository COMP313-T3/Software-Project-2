/**
 * The Gym Admin AI Route Assistant (US-023, FR-012, section 11 of the spec). It explains the
 * competition's official route statistics in plain language. It's read-only: it never changes
 * official scores, results, rankings, winners, or route grades.
 */

/** The shortest and longest question accepted, in characters. */
export const ROUTE_ASSISTANT_QUESTION_MIN_LENGTH = 3;
export const ROUTE_ASSISTANT_QUESTION_MAX_LENGTH = 500;

/** The most routes a question can be limited to with routeIds. */
export const ROUTE_ASSISTANT_MAX_FOCUS_ROUTES = 20;

/**
 * The most routes sent with one question, by route number. Gym competitions have far fewer; this
 * only keeps one question's size and cost bounded.
 */
export const ROUTE_ASSISTANT_MAX_ROUTES = 100;

/**
 * A route needs at least this many Climbers with official results before the assistant treats its
 * statistics as enough to compare with other routes (US-023 criterion 4). Below it, the answer says
 * the sample is small.
 */
export const ROUTE_ASSISTANT_MIN_RESULTS_FOR_COMPARISON = 3;

/** Questions one Gym Admin can ask per hour, across their competitions. Each one costs an AI call. */
export const ROUTE_ASSISTANT_QUESTIONS_PER_HOUR = 30;

/** The longest answer kept, in characters. A longer one is cut and marked truncated. */
export const ROUTE_ASSISTANT_ANSWER_MAX_LENGTH = 4000;

/** Anthropic Claude API settings. The model can be changed with ANTHROPIC_MODEL. */
export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";
export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";
/**
 * How much thinking the model does before answering. Low keeps answers quick and cheap, which suits
 * short explanations of a small table. An empty ANTHROPIC_EFFORT leaves it out, for models that
 * don't support the setting.
 */
export const ANTHROPIC_DEFAULT_EFFORT = "low";
/** Room for the answer and any thinking before it. */
export const ANTHROPIC_MAX_TOKENS = 2000;
/** How long the API may take to answer before the assistant gives up. */
export const ANTHROPIC_TIMEOUT_MS = 30_000;
