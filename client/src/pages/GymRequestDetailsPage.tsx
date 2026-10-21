import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import GymRequestDecision from "../components/admin/GymRequestDecision.tsx";
import GymRequestStatusBadge from "../components/admin/GymRequestStatusBadge.tsx";
import {
  applicantName,
  requestDateTime,
} from "../components/admin/gymRequestText.ts";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import {
  GYM_REQUEST_TYPE_DESCRIPTIONS,
  GYM_REQUEST_TYPE_LABELS,
} from "../constants/gymRequests.ts";
import { GYM_STATUS_LABELS } from "../constants/gyms.ts";
import { ROLES } from "../constants/roles.ts";
import { ApiError } from "../lib/apiClient.ts";
import {
  getGymRequest,
  type GymRequestAccountSetup,
  type GymRequestDetails,
  type GymRequestReviewResult,
} from "../lib/gymRequestReviewApi.ts";
import styles from "./GymsPage.module.css";
import detailStyles from "./GymRequestDetailsPage.module.css";

interface LoadState {
  key: number;
  request?: GymRequestDetails;
  error?: unknown;
}

interface Feedback {
  text: string;
  tone: "success" | "warning";
}

/** The list's filters, carried by the link that opened this page, so Back keeps them. */
function listSearchFrom(state: unknown): string {
  const value = (state as { listSearch?: unknown } | null)?.listSearch;
  return typeof value === "string" && /^\?[\w=&%+.-]*$/.test(value)
    ? value
    : "";
}

function loadProblem(reason: unknown): { message: string; canRetry: boolean } {
  if (reason instanceof ApiError && reason.status === 404) {
    return {
      message:
        "This request could not be found. It may no longer be available.",
      canRetry: false,
    };
  }
  if (reason instanceof ApiError && reason.status === 400) {
    return {
      message: "This request link is invalid. Choose a request from the list.",
      canRetry: false,
    };
  }
  if (reason instanceof ApiError) {
    return {
      message: reason.message,
      canRetry: ![401, 403].includes(reason.status),
    };
  }
  return {
    message: "Couldn't load this request. Please try again.",
    canRetry: true,
  };
}

/** Digits and a leading plus only, so the number works as a tel: link. */
function phoneHref(phone: string): string {
  return `tel:${phone.replace(/(?!^\+)[^\d]/g, "")}`;
}

function setupSummary(setup: GymRequestAccountSetup): {
  text: string;
  detail: string;
} {
  if (setup.completed) {
    return {
      text: "Completed",
      detail: setup.completedAt ? requestDateTime(setup.completedAt) : "",
    };
  }
  if (setup.linkExpiresAt && !setup.linkExpired) {
    return {
      text: "Waiting for the applicant",
      detail: `Setup link expires ${requestDateTime(setup.linkExpiresAt)}`,
    };
  }
  if (setup.linkExpiresAt) {
    return {
      text: "Not set up",
      detail: `Setup link expired ${requestDateTime(setup.linkExpiresAt)}`,
    };
  }
  return { text: "Not set up", detail: "" };
}

/**
 * Gym request details (US-035 criteria 2 and 3), with the Approve and Reject controls, for System
 * Administrators. Other roles see a message and no request is loaded; the server refuses them
 * too.
 */
export default function GymRequestDetailsPage() {
  const { user } = useSession();
  const { requestId } = useParams();
  if (user?.role !== ROLES.ADMIN) {
    return (
      <AccessRequired
        title="Administrator access required"
        allowed="System Administrators"
      />
    );
  }
  return (
    <GymRequestView
      key={`${user.userId}:${requestId}`}
      requestId={requestId ?? ""}
    />
  );
}

/**
 * Loads one request and shows the applicant, the gym, and the review. A decision replaces the
 * request with the one the API saved, so the status changes without a reload. After Refresh
 * request or Try again, focus moves to the review, or to the error when loading fails again.
 */
function GymRequestView({ requestId }: { requestId: string }) {
  const { state: locationState } = useLocation();
  const listSearch = listSearchFrom(locationState);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackBox = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const problemBox = useRef<HTMLDivElement>(null);
  const focusAfterLoad = useRef(false);
  const loading = state?.key !== revision;
  const request = loading ? null : (state?.request ?? null);
  const problem = !loading && state?.error ? loadProblem(state.error) : null;

  useEffect(() => {
    const controller = new AbortController();
    getGymRequest(requestId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ key: revision, request: result });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setState({ key: revision, error: reason });
      });
    return () => controller.abort();
  }, [requestId, revision]);

  useLayoutEffect(() => {
    if (feedback) feedbackBox.current?.focus();
  }, [feedback]);

  useLayoutEffect(() => {
    if (loading || !focusAfterLoad.current) return;
    focusAfterLoad.current = false;
    (reviewHeading.current ?? problemBox.current)?.focus();
  }, [loading]);

  function refresh() {
    focusAfterLoad.current = true;
    setFeedback(null);
    setRevision((value) => value + 1);
  }

  function showReviewed(result: GymRequestReviewResult) {
    setState({ key: revision, request: result.request });
    setFeedback({
      text: result.message,
      tone: result.emailSent ? "success" : "warning",
    });
  }

  function reloadOutdated(error: ApiError) {
    setFeedback({ text: error.message, tone: "warning" });
    setRevision((value) => value + 1);
  }

  const name = request ? applicantName(request.contact) : "";
  const gymName = request?.gym?.name || request?.proposedGym?.name;

  return (
    <AppLayout title="Gym request">
      <div className={styles.page}>
        <title>
          {gymName
            ? `Gym request for ${gymName} | TopSend`
            : "Gym request | TopSend"}
        </title>
        <div className={styles.intro}>
          <div>
            <Link
              to={`/admin/gym-requests${listSearch}`}
              className={styles.back}
            >
              Back to gym requests
            </Link>
            <p>
              Check the applicant's contact and gym details, then approve or
              reject the request.
            </p>
          </div>
          {request && (
            <button type="button" onClick={refresh}>
              Refresh request
            </button>
          )}
        </div>

        {feedback && (
          <div
            ref={feedbackBox}
            tabIndex={-1}
            role="status"
            className={`${detailStyles.feedback} ${feedback.tone === "success" ? styles.success : detailStyles.warning}`}
          >
            {feedback.text}
          </div>
        )}

        {loading && (
          <div
            className={`${styles.card} ${detailStyles.loading}`}
            role="status"
          >
            <span className={detailStyles.spinner} aria-hidden="true" />
            Loading request…
          </div>
        )}

        {problem && (
          <div
            ref={problemBox}
            tabIndex={-1}
            role="alert"
            className={`${styles.error} ${detailStyles.focusTarget}`}
          >
            <p>{problem.message}</p>
            {problem.canRetry && (
              <button type="button" onClick={refresh}>
                Try again
              </button>
            )}
          </div>
        )}

        {request && (
          <div className={detailStyles.layout}>
            <div className={detailStyles.column}>
              <ApplicantSection request={request} name={name} />
              <GymSection request={request} />
            </div>
            <section
              className={styles.card}
              aria-labelledby="request-review-heading"
            >
              <h2
                id="request-review-heading"
                ref={reviewHeading}
                tabIndex={-1}
                className={detailStyles.focusTarget}
              >
                Review
              </h2>
              <ReviewFacts request={request} />
              <GymRequestDecision
                request={request}
                onReviewed={showReviewed}
                onOutdated={reloadOutdated}
                onRefresh={refresh}
              />
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/** The applicant's contact details and anything else they wrote (US-035 criterion 2). */
function ApplicantSection({
  request,
  name,
}: {
  request: GymRequestDetails;
  name: string;
}) {
  const { email, phone, jobTitle } = request.contact;
  return (
    <section
      className={styles.card}
      aria-labelledby="request-applicant-heading"
    >
      <h2 id="request-applicant-heading">Applicant</h2>
      <dl className={styles.details}>
        <div>
          <dt>Name</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>
            {email ? <a href={`mailto:${email}`}>{email}</a> : "Not given"}
          </dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>
            {phone ? <a href={phoneHref(phone)}>{phone}</a> : "Not given"}
          </dd>
        </div>
        <div>
          <dt>Job title</dt>
          <dd>{jobTitle || "Not given"}</dd>
        </div>
      </dl>
      <h3 className={detailStyles.subheading}>Additional information</h3>
      <p className={detailStyles.notes}>
        {request.details || "The applicant didn't add anything else."}
      </p>
    </section>
  );
}

function gymLead({ requestType, status, gym }: GymRequestDetails): string {
  if (requestType === "NEW_GYM") {
    if (status === "APPROVED" && gym) {
      return "This gym was registered on TopSend when the request was approved.";
    }
    return status === "REJECTED"
      ? "The applicant asked to register this gym. It wasn't registered."
      : "The applicant wants to register this gym on TopSend.";
  }
  if (status === "APPROVED")
    return "The applicant was approved to administer this registered gym.";
  return status === "REJECTED"
    ? "The applicant asked to administer this registered gym."
    : "The applicant wants to administer this gym, which is already on TopSend.";
}

/**
 * The gym the request is about: the one a new-gym request submitted, or the existing gym an access
 * request selected, with its status and a link to it once it's registered.
 */
function GymSection({ request }: { request: GymRequestDetails }) {
  const registered = request.gym;
  const shown = registered ?? request.proposedGym;
  return (
    <section className={styles.card} aria-labelledby="request-gym-heading">
      <h2 id="request-gym-heading">
        {request.requestType === "NEW_GYM" ? "New gym" : "Selected gym"}
      </h2>
      <p className={detailStyles.lead}>{gymLead(request)}</p>
      <dl className={styles.details}>
        <div>
          <dt>Gym name</dt>
          <dd>{shown?.name || "Not given"}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{shown?.location || "Not given"}</dd>
        </div>
        {registered?.status && (
          <div>
            <dt>Gym status</dt>
            <dd>
              <span className={styles.badge} data-status={registered.status}>
                {GYM_STATUS_LABELS[registered.status] ?? registered.status}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {registered?.gymId && (
        <Link
          className={detailStyles.cardLink}
          to={`/admin/gyms/${encodeURIComponent(registered.gymId)}`}
          aria-label={`View gym details for ${registered.name}`}
        >
          View gym details
        </Link>
      )}
    </section>
  );
}

/** The request type, when it was submitted, its status, and how the review went. */
function ReviewFacts({ request }: { request: GymRequestDetails }) {
  const { review, accountSetup } = request;
  const reviewer = review?.reviewedBy;
  const reviewerName = reviewer
    ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(" ") ||
      reviewer.email
    : "Not recorded";
  const setup = accountSetup ? setupSummary(accountSetup) : null;
  return (
    <dl className={detailStyles.facts}>
      <div>
        <dt>Status</dt>
        <dd>
          <GymRequestStatusBadge status={request.status} />
        </dd>
      </div>
      <div>
        <dt>Request type</dt>
        <dd>
          {GYM_REQUEST_TYPE_LABELS[request.requestType] ?? "Unknown"}
          {GYM_REQUEST_TYPE_DESCRIPTIONS[request.requestType] && (
            <span className={detailStyles.muted}>
              {GYM_REQUEST_TYPE_DESCRIPTIONS[request.requestType]}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>Submitted</dt>
        <dd>
          <time dateTime={request.submittedAt}>
            {requestDateTime(request.submittedAt)}
          </time>
        </dd>
      </div>
      {review && (
        <>
          <div>
            <dt>{request.status === "REJECTED" ? "Rejected" : "Approved"}</dt>
            <dd>
              {review.reviewedAt ? (
                <time dateTime={review.reviewedAt}>
                  {requestDateTime(review.reviewedAt)}
                </time>
              ) : (
                "Not recorded"
              )}
            </dd>
          </div>
          <div>
            <dt>Reviewed by</dt>
            <dd>{reviewerName}</dd>
          </div>
        </>
      )}
      {request.status === "REJECTED" && (
        <div>
          <dt>Reason</dt>
          <dd className={detailStyles.notes}>
            {review?.rejectionReason || "No reason given"}
          </dd>
        </div>
      )}
      {setup && (
        <div>
          <dt>Account setup</dt>
          <dd>
            {setup.text}
            {setup.detail && (
              <span className={detailStyles.muted}>{setup.detail}</span>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}
