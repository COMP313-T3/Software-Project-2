/** Limits for route fields, shared by the request checks and the Route model. */
export const ROUTE_NUMBER_MAX_LENGTH = 40;
export const ROUTE_NAME_MAX_LENGTH = 50;
export const ROUTE_NOTES_MAX_LENGTH = 2000;
export const ROUTE_MAX_POINTS = 10000;

/** An official V-grade, from V0 to V17, written the way setters write it: V4, not v4 or V04. */
export const ROUTE_GRADE_PATTERN = /^V(?:[0-9]|1[0-7])$/;
