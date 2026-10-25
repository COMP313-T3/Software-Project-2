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

/**
 * What a System Administrator decides about a PENDING request (US-035). APPROVE moves it to
 * APPROVED and REJECT to REJECTED.
 */
export const GYM_REQUEST_DECISION = Object.freeze({
  APPROVE: "APPROVE",
  REJECT: "REJECT",
});

/** The longest rejection reason accepted. The applicant sees it in the rejection email. */
export const GYM_REQUEST_REJECTION_REASON_MAX_LENGTH = 500;

/**
 * How long an account setup link works after it's sent. Longer than a password reset link,
 * since the applicant may be waiting days for the decision and not check email right away.
 * An Admin can send a new link when it runs out.
 */
export const GYM_ADMIN_SETUP_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Setup link checks and account setups one IP address can try per hour. */
export const GYM_ADMIN_SETUP_TRIES_PER_HOUR = 30;

/** The review list's status filter value that shows requests of every status. */
export const GYM_REQUEST_LIST_ALL = "ALL";

/**
 * How long a request can wait for review. A PENDING request older than this is deleted
 * automatically, and the applicant can send a new one.
 */
export const GYM_REQUEST_PENDING_LIFETIME_DAYS = 30;
