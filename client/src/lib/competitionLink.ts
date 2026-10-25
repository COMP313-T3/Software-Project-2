import { ApiError } from "./apiClient.ts";

/** What a page says instead of its content when the competition ID in its address is malformed. */
export const INVALID_COMPETITION_LINK = "This competition link isn't valid.";

/** What a page says instead of its content when the route ID in its address is malformed. */
export const INVALID_ROUTE_LINK = "This route link isn't valid.";

/** What a page says instead of its content when the Climber ID in its address is malformed. */
export const INVALID_CLIMBER_LINK = "This climber link isn't valid.";

/** What the competition list says when the gym filter in its address is malformed. */
export const INVALID_GYM_FILTER = "This gym filter isn't valid. Choose a gym from the Gym list.";

/**
 * Whether the server refused an ID from the page's address because it isn't a valid ID (400
 * VALIDATION_ERROR on one of the fields), as with a mistyped or cut-off link. Trying again can't
 * help, so pages explain the link instead of offering a retry.
 *
 * @param error What the page's read threw.
 * @param fields The address's ID fields, such as "competitionId".
 * @returns True when the server refused one of them.
 */
export function isInvalidLink(error: unknown, ...fields: string[]): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === "VALIDATION_ERROR" &&
    fields.some((field) => typeof error.fields?.[field] === "string");
}

/**
 * Whether the server refused the competition ID in the page's address because it isn't a valid
 * ID (400 VALIDATION_ERROR on competitionId). Pages show INVALID_COMPETITION_LINK without a retry.
 *
 * @param error What the page's read threw.
 * @returns True for a malformed competition link.
 */
export function isInvalidCompetitionLink(error: unknown): boolean {
  return isInvalidLink(error, "competitionId");
}
