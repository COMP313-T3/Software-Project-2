import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface EventRegistrationInput { climberId: string; divisionId: string }
export interface EventRegistrationResult {
  registrationId: string;
  competitionId: string;
  divisionId: string;
  status: "CONFIRMED" | "PENDING" | "WAITLIST";
}
/** Refuse to confirm a different event/division or a malformed reply. */
export function checkedRegistrationResult(value: unknown, competitionId: string, divisionId: string): EventRegistrationResult {
  const result = value as Partial<EventRegistrationResult> | null;
  if (!result || typeof result.registrationId !== "string" || !result.registrationId.trim()
    || result.competitionId !== competitionId || result.divisionId !== divisionId
    || !["CONFIRMED", "PENDING", "WAITLIST"].includes(result.status ?? "")) {
    throw new Error("Registration response could not be confirmed for the selected event and division.");
  }
  return result as EventRegistrationResult;
}
/** Implements #109 and specs/contracts/interfaces.md §1.11.
 * The page supplies climberId from useSession, never from a user-editable field.
 * The server verifies it against the token and owns eligibility/capacity checks. */
export async function registerForEvent(competitionId: string, details: EventRegistrationInput, signal?: AbortSignal) {
  const body = { climberId: details.climberId, divisionId: details.divisionId };
  const result = await withAccessToken(token => apiRequest<unknown>(
    `/api/competitions/${encodeURIComponent(competitionId)}/registrations`,
    { method: "POST", body, headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return checkedRegistrationResult(result, competitionId, details.divisionId);
}
