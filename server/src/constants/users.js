import { ROLES } from "./roles.js";

/**
 * Manage Users, the System Administrator's searchable list of TopSend accounts (US-008).
 */

/** How each account role is shown on the Manage Users page. Visitors have no account. */
export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: "System Administrator",
  [ROLES.GYM_ADMIN]: "Gym Administrator",
  [ROLES.CLIMBER]: "Climber",
});

/** The account status filter: every account, or only active or deactivated ones. */
export const USER_STATUS_FILTER = Object.freeze({
  ALL: "all",
  ACTIVE: "active",
  INACTIVE: "inactive",
});

/** Every value allowed in the status filter. */
export const USER_STATUS_FILTERS = Object.freeze(Object.values(USER_STATUS_FILTER));

/** The orders the user list can show accounts in. By name unless another is chosen. */
export const USER_SORT = Object.freeze({
  NAME: "name",
  EMAIL: "email",
  NEWEST: "newest",
  OLDEST: "oldest",
});

/** Every value allowed for the list's order. */
export const USER_SORTS = Object.freeze(Object.values(USER_SORT));

/** The filter and order choices, with the labels the Manage Users page shows. */
export const USER_STATUS_OPTIONS = Object.freeze([
  Object.freeze({ value: USER_STATUS_FILTER.ALL, label: "All accounts" }),
  Object.freeze({ value: USER_STATUS_FILTER.ACTIVE, label: "Active" }),
  Object.freeze({ value: USER_STATUS_FILTER.INACTIVE, label: "Deactivated" }),
]);

export const USER_SORT_OPTIONS = Object.freeze([
  Object.freeze({ value: USER_SORT.NAME, label: "Name (A to Z)" }),
  Object.freeze({ value: USER_SORT.EMAIL, label: "Email (A to Z)" }),
  Object.freeze({ value: USER_SORT.NEWEST, label: "Newest accounts first" }),
  Object.freeze({ value: USER_SORT.OLDEST, label: "Oldest accounts first" }),
]);

/** The longest search text accepted, and how many of its words are used. */
export const USER_SEARCH_MAX_LENGTH = 100;
export const USER_SEARCH_MAX_WORDS = 5;
