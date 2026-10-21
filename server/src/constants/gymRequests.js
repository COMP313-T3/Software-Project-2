/**
 * Gym registration and Gym Administrator access requests (US-034, US-035).
 */

/** What a Visitor asks for: a gym that isn't on TopSend yet, or access to one that is. */
export const GYM_REQUEST_TYPE = Object.freeze({
  NEW_GYM: "NEW_GYM",
  EXISTING_GYM: "EXISTING_GYM",
});

/** Every value allowed in a request's requestType field. */
export const GYM_REQUEST_TYPES = Object.freeze(Object.values(GYM_REQUEST_TYPE));

/**
 * Where a request is in review. Every request starts PENDING; only a System Administrator moves
 * it to APPROVED or REJECTED (US-035).
 */
export const GYM_REQUEST_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

/** Every value allowed in a request's status field. */
export const GYM_REQUEST_STATUSES = Object.freeze(Object.values(GYM_REQUEST_STATUS));

/** Limits for request fields, shared by the request checks and the GymAdminRequest model. */
export const GYM_REQUEST_JOB_TITLE_MAX_LENGTH = 100;
export const GYM_REQUEST_DETAILS_MAX_LENGTH = 1000;

/** Requests one IP address can submit per hour. The form is public, so it's kept low. */
export const GYM_REQUEST_LIMIT_PER_HOUR = 5;

/** Gym lookups one IP address can make per hour, while typing in the "existing gym" search. */
export const GYM_LOOKUP_LIMIT_PER_HOUR = 120;

/** The most gyms one lookup answers. */
export const GYM_LOOKUP_MAX_RESULTS = 20;

/** The longest gym search text accepted. */
export const GYM_LOOKUP_SEARCH_MAX_LENGTH = 100;
