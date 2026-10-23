import { apiRequest } from "./apiClient.ts";

/** Whose account a setup link sets up, as the API describes it. */
export interface GymAdminSetupLink {
  firstName: string;
  lastName: string;
  email: string;
  gym: { name: string; location: string } | null;
}

/** The API's answer once the account is set up. */
export interface GymAdminSetupResult {
  status: "ACCOUNT_CREATED";
  message: string;
  user: { email: string; firstName: string; lastName: string; role: string };
  gym: { name: string; location: string };
}

/**
 * Checks that a Gym Administrator account setup link still works (US-035 criterion 6).
 *
 * @param token The token from the link in the approval email.
 * @param signal Cancels the check, for example when the page is left.
 * @returns The applicant's name and email, and the gym the account will manage.
 * @throws {ApiError} SETUP_LINK_INVALID when the link expired or was already used, or a message
 *   for the token field when the link was cut short.
 */
export function checkSetupLink(
  token: string,
  signal?: AbortSignal,
): Promise<GymAdminSetupLink> {
  return apiRequest<GymAdminSetupLink>("/api/gym-requests/setup/check", {
    method: "POST",
    body: { token },
    signal,
  });
}

/**
 * Creates the approved applicant's Gym Administrator account with the chosen password. The link
 * stops working once this succeeds, and the account still has to log in.
 *
 * @param token The token from the link in the approval email.
 * @param password The new password.
 * @returns The new account, its gym, and the message to show.
 * @throws {ApiError} SETUP_LINK_INVALID when the link expired or was already used, EMAIL_TAKEN when
 *   the email already has an account, or a message for the password field when it doesn't follow
 *   the rules.
 */
export function completeGymAdminSetup(
  token: string,
  password: string,
): Promise<GymAdminSetupResult> {
  return apiRequest<GymAdminSetupResult>("/api/gym-requests/setup", {
    method: "POST",
    body: { token, password },
  });
}
