import { apiRequest } from "./apiClient.ts";

/**
 * Asks for a password reset link. The API answers the same way whether or not the email has an
 * account, so the page always says the link is on its way.
 *
 * @param email The email typed in the form.
 * @throws {ApiError} When the email isn't valid, too many links were asked for, or email is off.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

/**
 * Checks that a reset link still works.
 *
 * @param token The token from the link in the email.
 * @param signal Cancels the check, for example when the page is left.
 * @returns The email of the account the link resets.
 * @throws {ApiError} RESET_LINK_INVALID when the link expired or was already used.
 */
export function checkResetLink(
  token: string,
  signal?: AbortSignal,
): Promise<{ email: string }> {
  return apiRequest<{ email: string }>("/api/auth/reset-password/check", {
    method: "POST",
    body: { token },
    signal,
  });
}

/**
 * Sets a new password with a reset link. The link stops working once this succeeds.
 *
 * @param token The token from the link in the email.
 * @param password The new password.
 * @throws {ApiError} RESET_LINK_INVALID when the link expired or was already used, or a message
 *   for the password field when it doesn't follow the rules.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<void> {
  await apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: { token, password },
  });
}
