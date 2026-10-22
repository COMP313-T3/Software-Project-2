import {
  ROUTE_GRADE_PATTERN, ROUTE_MAX_POINTS, ROUTE_NAME_MAX_LENGTH, ROUTE_NOTES_MAX_LENGTH, ROUTE_NUMBER_MAX_LENGTH,
} from "../constants/routes.ts";

export const ROUTE_FIELD_ORDER = ["routeNumber", "name", "grade", "pointValue", "notes"] as const;
export type RouteField = typeof ROUTE_FIELD_ORDER[number];
export type RouteFormValues = Record<RouteField, string>;
export type RouteFieldErrors = Partial<Record<RouteField, string>>;
export const ROUTE_EDIT_FIELDS = ["grade", "pointValue", "notes"] as const;
export type RouteEditField = typeof ROUTE_EDIT_FIELDS[number];
export type RouteEditValues = Pick<RouteFormValues, RouteEditField>;
export type RouteEditErrors = Partial<Record<RouteEditField, string>>;

/** The points a route can have, in words: "0 to 10,000". */
export const ROUTE_POINTS_RANGE = `0 to ${new Intl.NumberFormat("en-CA").format(ROUTE_MAX_POINTS)}`;

/** The same messages the API sends for these fields. */
export const ROUTE_GRADE_MESSAGE = "Enter a V-grade from V0 to V17, such as V4.";
export const ROUTE_POINTS_MESSAGE = `Enter a whole number of points from ${ROUTE_POINTS_RANGE}.`;

function tooLong(maxLength: number) {
  return `Use ${maxLength} characters or fewer.`;
}

function isWholePoints(text: string) {
  return /^\d+$/.test(text) && Number(text) <= ROUTE_MAX_POINTS;
}

/**
 * Checks the fields the route details form can change (US-017) with the API's rules: an official
 * V-grade from V0 to V17, optional whole points from 0 to 10,000, and notes up to 2000 characters.
 * Given the saved values, it skips fields that still match them, as the API only checks the fields
 * it's sent, so a route saved before these limits can still have its other details changed.
 */
export function validateRouteEdit(values: RouteEditValues, saved?: RouteEditValues): RouteEditErrors {
  const errors: RouteEditErrors = {};
  const changed = (field: RouteEditField) => !saved || values[field].trim() !== saved[field].trim();
  if (changed("grade") && !ROUTE_GRADE_PATTERN.test(values.grade.trim())) errors.grade = ROUTE_GRADE_MESSAGE;
  const points = values.pointValue.trim();
  if (changed("pointValue") && points && !isWholePoints(points)) errors.pointValue = ROUTE_POINTS_MESSAGE;
  if (changed("notes") && values.notes.trim().length > ROUTE_NOTES_MAX_LENGTH) {
    errors.notes = tooLong(ROUTE_NOTES_MAX_LENGTH);
  }
  return errors;
}

/**
 * Checks the add route form (US-016) with the API's rules. The route number identifies the route,
 * so its name is optional. The point value is required: it's what a top on the first attempt
 * scores (US-018).
 */
export function validateRouteForm(values: RouteFormValues): RouteFieldErrors {
  const errors: RouteFieldErrors = validateRouteEdit(values);
  if (!values.pointValue.trim()) errors.pointValue = ROUTE_POINTS_MESSAGE;
  const routeNumber = values.routeNumber.trim();
  if (!routeNumber) errors.routeNumber = "Enter the route number.";
  else if (routeNumber.length > ROUTE_NUMBER_MAX_LENGTH) errors.routeNumber = tooLong(ROUTE_NUMBER_MAX_LENGTH);
  if (values.name.trim().length > ROUTE_NAME_MAX_LENGTH) errors.name = tooLong(ROUTE_NAME_MAX_LENGTH);
  return errors;
}
