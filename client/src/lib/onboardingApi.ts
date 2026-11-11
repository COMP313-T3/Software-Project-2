import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** Whether the logged-in user has seen the onboarding tutorial (US-037). */
export interface OnboardingState {
  seen: boolean;
  /** When they first finished or skipped it, or null while they haven't. */
  seenAt: string | null;
}

const PATH = "/api/users/me/onboarding";

/**
 * Reads the API's answer. An answer that doesn't say clearly whether the tutorial was seen is an
 * error, so a bad answer never opens the tutorial by itself.
 *
 * @param value The parsed response body.
 */
export function readOnboarding(value: unknown): OnboardingState {
  const data = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (typeof data?.seen !== "boolean") throw new Error("The onboarding answer didn't say whether it was seen.");
  return { seen: data.seen, seenAt: data.seen && typeof data.seenAt === "string" ? data.seenAt : null };
}

/**
 * Whether the logged-in user has seen the onboarding tutorial.
 *
 * @param signal Cancels the request.
 */
export async function getOnboarding(signal?: AbortSignal): Promise<OnboardingState> {
  const body = await withAccessToken((token) =>
    apiRequest<unknown>(PATH, { signal, headers: { Authorization: `Bearer ${token}` } }),
  );
  return readOnboarding(body);
}

/** Records on the account that the user finished or skipped the onboarding tutorial. */
export async function markOnboardingSeen(): Promise<OnboardingState> {
  const body = await withAccessToken((token) =>
    apiRequest<unknown>(PATH, { method: "PUT", body: { seen: true }, headers: { Authorization: `Bearer ${token}` } }),
  );
  return readOnboarding(body);
}
