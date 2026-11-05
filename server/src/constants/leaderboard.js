/**
 * Live leaderboards (US-020, US-032).
 */

/**
 * How Climbers in the same division are ordered (US-020: "handle ties using the supported
 * competition rules"). Each rule only matters when every rule before it is equal. Climbers still
 * equal after the last rule share a rank (1, 1, 3), and are listed by name.
 *
 * key: the total compared. order: "desc" puts the larger total first, "asc" the smaller.
 */
export const LEADERBOARD_TIEBREAKERS = Object.freeze([
  Object.freeze({ key: "totalScore", order: "desc", label: "Highest total score" }),
  Object.freeze({ key: "sends", order: "desc", label: "Most problems sent" }),
  Object.freeze({ key: "flashes", order: "desc", label: "Most flashes" }),
  Object.freeze({
    key: "attemptsToTops",
    order: "asc",
    label: "Fewest attempts on the problems sent",
  }),
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