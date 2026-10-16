export const ROUTE_FIELD_ORDER = ["routeNumber", "name", "grade", "pointValue", "notes"] as const;
export type RouteField = typeof ROUTE_FIELD_ORDER[number];
export type RouteFormValues = Record<RouteField, string>;
export type RouteFieldErrors = Partial<Record<RouteField, string>>;
export const ROUTE_EDIT_FIELDS = ["grade", "pointValue", "notes"] as const;
export type RouteEditField = typeof ROUTE_EDIT_FIELDS[number];
export type RouteEditValues = Pick<RouteFormValues, RouteEditField>;
export type RouteEditErrors = Partial<Record<RouteEditField, string>>;

export function validateRouteEdit(values: RouteEditValues): RouteEditErrors {
  const errors: RouteEditErrors = {};
  if (!/^V(?:0|[1-9]\d*)$/.test(values.grade.trim())) errors.grade = "Enter a V-grade, such as V4.";
  if (values.pointValue.trim() && !Number.isFinite(Number(values.pointValue))) {
    errors.pointValue = "Enter a finite number of points, or leave this blank.";
  }
  return errors;
}

/** Match the current route API; no upper grade or point limits are specified.
 * Scoring-format metadata is not yet available, so points remain optional. */
export function validateRouteForm(values: RouteFormValues): RouteFieldErrors {
  const errors: RouteFieldErrors = validateRouteEdit(values);
  if (!values.routeNumber.trim()) errors.routeNumber = "Enter the route number.";
  if (!values.name.trim()) errors.name = "Enter the route name.";
  return errors;
}
