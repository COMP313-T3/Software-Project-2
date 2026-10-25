import { ApiError } from "../../lib/apiClient.ts";

/**
 * The API refused because the request changed since the page loaded it: it was reviewed or
 * deleted, or one of its checks now fails. The page reloads it to show why.
 *
 * @param error What the API call threw.
 * @returns Whether the error is a 404 or a 409 from the API.
 */
export function isOutdated(error: unknown): error is ApiError {
  return (
    error instanceof ApiError && (error.status === 404 || error.status === 409)
  );
}

/**
 * A lost connection or a server error leaves it unknown whether the change was saved.
 *
 * @param error What the API call threw.
 * @returns Whether the change may have been saved anyway.
 */
export function isUncertain(error: unknown): boolean {
  return (
    !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  );
}
