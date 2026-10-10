/**
 * Where a competition is in its life. A DRAFT is only seen by its gym's administrators;
 * PUBLISHED competitions can be found by climbers; CANCELLED ones stay in the gym's history.
 */
export const COMPETITION_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  CANCELLED: "CANCELLED",
});

/** Every value allowed in a competition's status field. */
export const COMPETITION_STATUSES = Object.freeze(
  Object.values(COMPETITION_STATUS),
);

/** Whether climbers can currently register for a competition (FR-004, FR-009). */
export const REGISTRATION_STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED",
});

/** Every value allowed in a competition's registrationStatus field. */
export const REGISTRATION_STATUSES = Object.freeze(
  Object.values(REGISTRATION_STATUS),
);

/** Which competitions a Gym Admin's list shows, compared with today's date in Toronto. */
export const COMPETITION_PERIOD = Object.freeze({
  UPCOMING: "upcoming",
  PAST: "past",
  ALL: "all",
});

/** Every value allowed in the period filter. */
export const COMPETITION_PERIODS = Object.freeze(
  Object.values(COMPETITION_PERIOD),
);

/** Limits for competition fields, shared by the request checks and the Competition model. */
export const COMPETITION_NAME_MAX_LENGTH = 100;
export const COMPETITION_LOCATION_MAX_LENGTH = 200;
export const COMPETITION_DESCRIPTION_MAX_LENGTH = 2000;
export const COMPETITION_MAX_CAPACITY = 1000;

/** How many upcoming competitions the Gym Admin Dashboard shows before "see all". */
export const DASHBOARD_UPCOMING_LIMIT = 5;
