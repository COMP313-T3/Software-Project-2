import { ApiError } from "./apiClient.ts";

/** What a page says instead of its content when the competition ID in its address is malformed. */
export const INVALID_COMPETITION_LINK = "This competition link isn't valid.";

/**
 * Whether the server refused the competition ID in the page's address because it isn't a valid
 * ID (400 VALIDATION_ERROR on competitionId), as with a mistyped or cut-off link. Trying again
 * can't help, so pages show INVALID_COMPETITION_LINK without a retry.
 *
 * @param error What the page's read threw.
 * @returns True for a malformed competition link.
 */
export function isInvalidCompetitionLink(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === "VALIDATION_ERROR" &&
    typeof error.fields?.competitionId === "string";
}
