import { ROLES } from "./roles.js";

/** The Socket.IO namespace open pages listen on for changes to the data they show. */
export const PAGE_UPDATES_NAMESPACE = "/updates";

/** Socket.IO events. The server sends CHANGED, and CLOSED when the connection's login has ended. */
export const PAGE_UPDATE_EVENTS = Object.freeze({
  CHANGED: "updates:changed",
  CLOSED: "updates:closed",
});

/** The kinds of data a page shows, which a change is announced by. */
export const PAGE_TOPIC = Object.freeze({
  /** Competitions and what belongs to one: its divisions, problems, scoring, display, and registrations. */
  COMPETITIONS: "competitions",
  /** Official results. They change far more often than the rest, so they have their own topic. */
  RESULTS: "results",
  /** Gyms, and which Gym Administrators are assigned to them. */
  GYMS: "gyms",
  /** User accounts. */
  USERS: "users",
  /** Requests for Gym Administrator access. */
  GYM_REQUESTS: "gym-requests",
  /** The platform's settings. */
  SETTINGS: "settings",
});

/**
 * The roles whose pages show each kind of data. A change is announced only to them, so a role
 * never hears about an area it can't open, such as a Climber about gym requests.
 */
export const PAGE_TOPIC_ROLES = Object.freeze({
  [PAGE_TOPIC.COMPETITIONS]: [ROLES.ADMIN, ROLES.GYM_ADMIN, ROLES.CLIMBER],
  [PAGE_TOPIC.RESULTS]: [ROLES.GYM_ADMIN],
  [PAGE_TOPIC.GYMS]: [ROLES.ADMIN, ROLES.GYM_ADMIN, ROLES.CLIMBER],
  [PAGE_TOPIC.USERS]: [ROLES.ADMIN],
  [PAGE_TOPIC.GYM_REQUESTS]: [ROLES.ADMIN],
  [PAGE_TOPIC.SETTINGS]: [ROLES.ADMIN],
});

/**
 * The roles told which competition changed, so only the pages about it reload. A Climber isn't,
 * since the competition may be a draft they can't see: their pages reload on any competition change.
 */
export const PAGE_UPDATE_NAMES_COMPETITION = Object.freeze([ROLES.ADMIN, ROLES.GYM_ADMIN]);

/**
 * How long the server gathers changes before announcing them, so a burst of saves, such as
 * several results in a row, is announced once.
 */
export const PAGE_UPDATE_DELAY_MS = 300;

/** How long a connection's login session is trusted before it's checked again. */
export const PAGE_UPDATE_SESSION_CHECK_MS = 60_000;

/**
 * The request header a page sends with a read it makes by itself after a change was announced.
 * Such a read isn't the user's own activity, so it doesn't keep the session going.
 */
export const AUTOMATIC_REQUEST_HEADER = "X-TopSend-Automatic";
