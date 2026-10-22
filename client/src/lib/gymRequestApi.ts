import { ApiError, apiRequest } from "./apiClient.ts";

export type GymRequestType = "NEW_GYM" | "EXISTING_GYM";
export interface RequestGym { _id: string; name: string; location: string }
export interface GymRequestContact {
  firstName: string; lastName: string; email: string; phone: string;
  jobTitle: string; details: string;
}
export type GymRequestInput = GymRequestContact & { recaptchaToken: string; website: string } & (
  { requestType: "NEW_GYM"; gymName: string; gymLocation: string } |
  { requestType: "EXISTING_GYM"; gymId: string }
);
export interface GymRequestConfirmation {
  requestId: string; requestType: GymRequestType; status: "PENDING";
  gym: { name: string; location: string }; contact: { email: string };
}

/** Public Visitor endpoints for US034. Submitting a request creates no account or role. */
export function findRequestGyms(q: string, signal?: AbortSignal) {
  const search = new URLSearchParams();
  if (q.trim()) search.set("q", q.trim());
  return apiRequest<{ gyms: RequestGym[] }>(`/api/gym-requests/gyms${search.size ? `?${search}` : ""}`, { signal });
}
export async function submitGymRequest(input: GymRequestInput): Promise<GymRequestConfirmation> {
  const response = await apiRequest<GymRequestConfirmation>("/api/gym-requests", { method: "POST", body: input });
  // A successful HTTP response alone must not produce an approval/success screen.
  if (!response || response.status !== "PENDING" || typeof response.requestId !== "string" || !response.requestId ||
      response.requestType !== input.requestType || typeof response.gym?.name !== "string" || !response.gym.name ||
      typeof response.contact?.email !== "string" || response.contact.email.toLowerCase() !== input.email.trim().toLowerCase()) {
    throw new ApiError(502, "INVALID_CONFIRMATION", "We couldn't confirm the submission. Please contact TopSend before submitting again.");
  }
  return response;
}

/**
 * Refusals whose message the API writes for the applicant, so the summary repeats it word for word
 * and matches the message under the field.
 */
const ANSWERED_BY_SERVER = new Set(["REQUEST_PENDING", "REQUEST_APPROVED", "EMAIL_TAKEN", "GYM_EXISTS"]);

/**
 * The message the form's summary shows when a request isn't accepted. Server faults never show
 * their technical details.
 *
 * @param error What the submission threw.
 * @returns The message to show.
 */
export function gymRequestProblem(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many requests. Please wait before trying again.";
    if (ANSWERED_BY_SERVER.has(error.code) && error.message) return error.message;
    if (error.code === "INVALID_CONFIRMATION") return error.message;
    if (error.status === 0) return "We couldn't confirm that your request arrived. Check your connection. If you already submitted, contact TopSend before trying again.";
    if (error.status === 400) return "Check the highlighted fields and try again.";
  }
  return "We couldn't submit your request. Please try again later.";
}
