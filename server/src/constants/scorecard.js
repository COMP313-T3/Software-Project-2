/**
 * A Climber's digital scorecard (US-031).
 */

/**
 * Where the Climber is on one boulder problem (US-031 criterion 2). FLASHED and SENT are
 * completed; ATTEMPTED and NOT_ATTEMPTED are unfinished.
 */
export const SCORECARD_ROUTE_STATUS = Object.freeze({
  FLASHED: "FLASHED",
  SENT: "SENT",
  ATTEMPTED: "ATTEMPTED",
  NOT_ATTEMPTED: "NOT_ATTEMPTED",
});

/** How each problem's status reads on the scorecard. */
export const SCORECARD_ROUTE_STATUS_LABELS = Object.freeze({
  [SCORECARD_ROUTE_STATUS.FLASHED]: "Flashed",
  [SCORECARD_ROUTE_STATUS.SENT]: "Sent",
  [SCORECARD_ROUTE_STATUS.ATTEMPTED]: "Attempted, not sent yet",
  [SCORECARD_ROUTE_STATUS.NOT_ATTEMPTED]: "Not attempted yet",
});

/** The Socket.IO namespace live scorecards use. */
export const SCORECARD_NAMESPACE = "/scorecard";

/** Socket.IO events. Clients send JOIN and LEAVE; the server sends UPDATE and CLOSED. */
export const SCORECARD_EVENTS = Object.freeze({
  JOIN: "scorecard:join",
  LEAVE: "scorecard:leave",
  UPDATE: "scorecard:update",
  CLOSED: "scorecard:closed",
});

/**
 * How long the server waits after a result changes before sending the new scorecard, so a judge
 * recording several attempts in a row causes one update, not one per attempt.
 */
export const SCORECARD_UPDATE_DELAY_MS = 300;

/** How many scorecards one connection can follow at once. */
export const SCORECARD_MAX_PER_CONNECTION = 5;
