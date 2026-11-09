/**
 * Live leaderboards (US-020, US-032).
 */

/**
 * How Climbers in the same division are ordered (US-020, US-032: "handle ties using the
 * competition's scoring rules"). The scoring rules rank by total score only: Climbers with equal
 * totals share a place (1, 2, 2, 4) and are listed by name. Sends, flashes and attempts are shown
 * on the leaderboard, but they never break a tie.
 *
 * key: the total compared. order: "desc" puts the larger total first, "asc" the smaller.
 */
export const LEADERBOARD_TIEBREAKERS = Object.freeze([
  Object.freeze({ key: "totalScore", order: "desc", label: "Highest total score" }),
]);

/** Who a leaderboard is shown to. Each sees the same standings with different details. */
export const LEADERBOARD_AUDIENCE = Object.freeze({
  /** A Gym Admin of the competition's gym: Climber IDs and the public access setting. */
  MANAGE: "manage",
  /** A Climber registered for the competition: their own place is marked. */
  CLIMBER: "climber",
  /** Anyone, when the Gym Admin made the leaderboard public: names and scores only. */
  PUBLIC: "public",
});

/** The Socket.IO namespace the live leaderboards use. */
export const LEADERBOARD_NAMESPACE = "/leaderboard";

/** Socket.IO events. Clients send JOIN and LEAVE; the server sends UPDATE and CLOSED. */
export const LEADERBOARD_EVENTS = Object.freeze({
  JOIN: "leaderboard:join",
  LEAVE: "leaderboard:leave",
  UPDATE: "leaderboard:update",
  CLOSED: "leaderboard:closed",
});

/**
 * How long the server waits after an official result changes before sending new standings. A
 * Climber or Gym Admin recording several attempts in a row then causes one update, not one per
 * attempt.
 */
export const LEADERBOARD_UPDATE_DELAY_MS = 300;

/** How many competitions one connection can follow at once. */
export const LEADERBOARD_MAX_ROOMS_PER_CONNECTION = 5;

/** Public leaderboard requests one IP address can make per hour, such as a display screen's. */
export const PUBLIC_LEADERBOARD_LIMIT_PER_HOUR = 1200;
