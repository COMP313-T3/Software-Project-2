import { apiRequest } from "./apiClient.ts";
import type { GymRequestType } from "./gymRequestApi.ts";
import type { GymStatus } from "./gymsApi.ts";
import { withAccessToken } from "./sessionClient.ts";

/** Where a gym request is in review. Only a System Administrator moves it out of PENDING. */
export type GymRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** The review list's status filter: one status, or ALL for every request. */
export type GymRequestListStatus = GymRequestStatus | "ALL";

/** A gym as a request shows it: the registered gym once there is one, else the proposed gym. */
export interface GymRequestGym {
  /** Null for a proposed gym that isn't registered yet. */
  gymId: string | null;
  name: string;
  location: string;
  /** Null for a proposed gym that isn't registered yet. */
  status: GymStatus | null;
}

/** How to reach the applicant, who has no TopSend account until their request is approved. */
export interface GymRequestContact {
  firstName: string;
  lastName: string;
  email: string;
}

/** One request in the review list. */
export interface GymRequestSummary {
  requestId: string;
  requestType: GymRequestType;
  status: GymRequestStatus;
  submittedAt: string;
  reviewedAt: string | null;
  contact: GymRequestContact;
  gym: GymRequestGym | null;
}

/** One page of the review list. */
export interface GymRequestPage {
  requests: GymRequestSummary[];
  total: number;
  page: number;
  limit: number;
}

/** Which requests the review list shows. */
export interface GymRequestFilters {
  status: GymRequestListStatus;
  /** Empty for both request types. */
  requestType: GymRequestType | "";
  page: number;
}

/** What would stop an approval, checked when a PENDING request is loaded. */
export interface GymRequestChecks {
  /** The applicant's email already has a TopSend account. */
  emailHasAccount: boolean;
  /** NEW_GYM only: a gym with this name and location is already registered. */
  gymAlreadyRegistered?: boolean;
  /** EXISTING_GYM only: the chosen gym is still registered. */
  gymRegistered?: boolean;
  /** EXISTING_GYM only: the chosen gym is ACTIVE. */
  gymActive?: boolean;
}

/** The System Administrator who approved or rejected a request. */
export interface GymRequestReviewer {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Who reviewed a request, when, and why it was rejected. */
export interface GymRequestReview {
  reviewedBy: GymRequestReviewer | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/** How an approved applicant's account setup is going. */
export interface GymRequestAccountSetup {
  completed: boolean;
  completedAt: string | null;
  linkExpiresAt: string | null;
  linkExpired: boolean;
}

/** Everything a System Administrator needs to review one request (US-035 criterion 2). */
export interface GymRequestDetails {
  requestId: string;
  requestType: GymRequestType;
  status: GymRequestStatus;
  submittedAt: string;
  contact: GymRequestContact & { phone: string; jobTitle: string | null };
  /** Anything else the applicant wrote for the reviewer. */
  details: string | null;
  /** The gym a NEW_GYM request asks to register. */
  proposedGym: { name: string; location: string } | null;
  /** The registered gym: the one an EXISTING_GYM request chose, or the one an approval registered. */
  gym: GymRequestGym | null;
  /** Only for PENDING requests. */
  checks: GymRequestChecks | null;
  /** Null while the request is PENDING. */
  review: GymRequestReview | null;
  /** Only for APPROVED requests. */
  accountSetup: GymRequestAccountSetup | null;
}

/** The System Administrator's decision. Only a rejection can carry a reason. */
export type GymRequestDecision =
  | { decision: "APPROVE" }
  | { decision: "REJECT"; reason?: string };

/** Which decision the System Administrator is making. */
export type GymRequestChoice = GymRequestDecision["decision"];

/** The answer to a decision. */
export interface GymRequestReviewResult {
  /** What happened, including whether the applicant's email went out. */
  message: string;
  /** The request as saved after the decision. */
  request: GymRequestDetails;
  emailSent: boolean;
}

const PAGE_SIZE = 20;

interface ServerGym {
  _id?: string | null;
  name?: string;
  location?: string;
  status?: GymStatus | null;
}

interface ServerContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string | null;
}

type ServerSummary = Omit<
  GymRequestSummary,
  "requestId" | "contact" | "gym"
> & {
  _id?: string;
  contact?: ServerContact;
  gym?: ServerGym | null;
};

type ServerReview = Omit<GymRequestReview, "reviewedBy"> & {
  reviewedBy?: (Omit<GymRequestReviewer, "userId"> & { _id?: string }) | null;
};

type ServerDetails = Omit<
  GymRequestDetails,
  "requestId" | "contact" | "gym" | "review"
> & {
  _id?: string;
  contact?: ServerContact;
  gym?: ServerGym | null;
  review?: ServerReview | null;
};

function idOf(id: string | undefined): string {
  if (!id) throw new Error("The server returned a gym request without an ID.");
  return id;
}

function normalizeGym(gym: ServerGym | null | undefined): GymRequestGym | null {
  if (!gym) return null;
  return {
    gymId: gym._id ?? null,
    name: gym.name ?? "",
    location: gym.location ?? "",
    status: gym.status ?? null,
  };
}

/** Requests saved before contact details were collected have none, so every field may be missing. */
function normalizeContact(
  contact: ServerContact | undefined,
): GymRequestContact {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
  };
}

function normalizeSummary(request: ServerSummary): GymRequestSummary {
  return {
    requestId: idOf(request._id),
    requestType: request.requestType,
    status: request.status,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt ?? null,
    contact: normalizeContact(request.contact),
    gym: normalizeGym(request.gym),
  };
}

function normalizeReview(
  review: ServerReview | null | undefined,
): GymRequestReview | null {
  if (!review) return null;
  const reviewer = review.reviewedBy;
  return {
    reviewedBy: reviewer?._id
      ? {
          userId: reviewer._id,
          firstName: reviewer.firstName ?? "",
          lastName: reviewer.lastName ?? "",
          email: reviewer.email ?? "",
        }
      : null,
    reviewedAt: review.reviewedAt ?? null,
    rejectionReason: review.rejectionReason ?? null,
  };
}

function normalizeDetails(request: ServerDetails): GymRequestDetails {
  return {
    requestId: idOf(request._id),
    requestType: request.requestType,
    status: request.status,
    submittedAt: request.submittedAt,
    contact: {
      ...normalizeContact(request.contact),
      phone: request.contact?.phone ?? "",
      jobTitle: request.contact?.jobTitle ?? null,
    },
    details: request.details ?? null,
    proposedGym: request.proposedGym ?? null,
    gym: normalizeGym(request.gym),
    checks: request.checks ?? null,
    review: normalizeReview(request.review),
    accountSetup: request.accountSetup ?? null,
  };
}

/**
 * Loads one page of gym registration and Gym Administrator access requests (US-035 criterion 1).
 * The API lists PENDING requests oldest first, and other statuses newest first.
 *
 * @param filters The status, the request type (empty for both), and the page.
 * @param signal Cancels the request when the filters change or the page closes.
 * @returns The page of requests and the total that match.
 * @throws {ApiError} When the list can't be loaded.
 */
export async function listGymRequests(
  filters: GymRequestFilters,
  signal?: AbortSignal,
): Promise<GymRequestPage> {
  const query = new URLSearchParams({
    status: filters.status,
    page: String(filters.page),
    limit: String(PAGE_SIZE),
  });
  if (filters.requestType) query.set("requestType", filters.requestType);
  const result = await withAccessToken((token) =>
    apiRequest<
      Omit<GymRequestPage, "requests"> & { requests: ServerSummary[] }
    >(`/api/admin/gym-requests?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    }),
  );
  return { ...result, requests: result.requests.map(normalizeSummary) };
}

/**
 * Loads one request with the applicant's contact details and the gym (US-035 criterion 2).
 *
 * @param requestId The request's ID from the address.
 * @param signal Cancels the request when the page closes.
 * @returns The request's details.
 * @throws {ApiError} 404 GYM_REQUEST_NOT_FOUND, or 400 for an ID that isn't valid.
 */
export async function getGymRequest(
  requestId: string,
  signal?: AbortSignal,
): Promise<GymRequestDetails> {
  const result = await withAccessToken((token) =>
    apiRequest<ServerDetails>(
      `/api/admin/gym-requests/${encodeURIComponent(requestId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    ),
  );
  return normalizeDetails(result);
}

/**
 * Approves or rejects a PENDING request (US-035 criterion 3). The API client never repeats a
 * write that failed, and the API reviews each request only once, so a decision can't be saved
 * twice. The one resend is after an expired login, which the API refuses before reviewing.
 *
 * @param requestId The request to review.
 * @param decision APPROVE, or REJECT with an optional reason for the applicant.
 * @param signal Cancels waiting for the answer. The API may still have saved the decision.
 * @returns The API's message, the saved request, and whether the applicant's email went out.
 * @throws {ApiError} 409 GYM_REQUEST_ALREADY_REVIEWED, EMAIL_TAKEN, GYM_EXISTS, or GYM_NOT_FOUND,
 *   404 GYM_REQUEST_NOT_FOUND, or 400 VALIDATION_ERROR.
 */
export async function reviewGymRequest(
  requestId: string,
  decision: GymRequestDecision,
  signal?: AbortSignal,
): Promise<GymRequestReviewResult> {
  const body: GymRequestDecision =
    decision.decision === "REJECT" && decision.reason
      ? { decision: "REJECT", reason: decision.reason }
      : { decision: decision.decision };
  const result = await withAccessToken((token) =>
    apiRequest<{ message: string; request: ServerDetails; emailSent: boolean }>(
      `/api/admin/gym-requests/${encodeURIComponent(requestId)}/review`,
      {
        method: "PATCH",
        body,
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    ),
  );
  return {
    message: result.message,
    request: normalizeDetails(result.request),
    emailSent: result.emailSent,
  };
}
