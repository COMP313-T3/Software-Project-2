import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import GymRequestStatusBadge from "../components/admin/GymRequestStatusBadge.tsx";
import {
  applicantName,
  requestDateTime,
} from "../components/admin/gymRequestText.ts";
import AccessRequired from "../components/layout/AccessRequired.tsx";
import AppLayout from "../components/layout/AppLayout.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import {
  GYM_REQUEST_STATUS_LABELS,
  GYM_REQUEST_TYPE_LABELS,
} from "../constants/gymRequests.ts";
import { ROLES } from "../constants/roles.ts";
import { ApiError } from "../lib/apiClient.ts";
import type { GymRequestType } from "../lib/gymRequestApi.ts";
import {
  listGymRequests,
  type GymRequestFilters,
  type GymRequestListStatus,
  type GymRequestPage,
  type GymRequestSummary,
} from "../lib/gymRequestReviewApi.ts";
import styles from "./GymsPage.module.css";
import listStyles from "./GymRequestsPage.module.css";

const STATUS_FILTERS: { value: GymRequestListStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All statuses" },
];

const TYPE_FILTERS: { value: GymRequestType | ""; label: string }[] = [
  { value: "", label: "All request types" },
  { value: "NEW_GYM", label: GYM_REQUEST_TYPE_LABELS.NEW_GYM },
  { value: "EXISTING_GYM", label: GYM_REQUEST_TYPE_LABELS.EXISTING_GYM },
];

const numberFormat = new Intl.NumberFormat("en-CA");

/** The list's filters from the address, so they survive opening a request and coming back. */
function readFilters(params: URLSearchParams): GymRequestFilters {
  const status = STATUS_FILTERS.find(
    ({ value }) => value === params.get("status"),
  );
  const requestType = TYPE_FILTERS.find(
    ({ value }) => value && value === params.get("type"),
  );
  const page = Number(params.get("page"));
  return {
    status: status?.value ?? "PENDING",
    requestType: requestType?.value ?? "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The address for a set of filters. The defaults stay out of it. */
function writeFilters({
  status,
  requestType,
  page,
}: GymRequestFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (status !== "PENDING") params.set("status", status);
  if (requestType) params.set("type", requestType);
  if (page > 1) params.set("page", String(page));
  return params;
}

function listProblem(reason: unknown): string {
  return reason instanceof ApiError
    ? reason.message
    : "Couldn't load gym requests. Please try again.";
}

function countText(total: number, status: GymRequestListStatus): string {
  const word =
    status === "ALL"
      ? ""
      : `${GYM_REQUEST_STATUS_LABELS[status].toLowerCase()} `;
  return `${numberFormat.format(total)} ${word}${total === 1 ? "request" : "requests"}`;
}

function emptyText({ status, requestType }: GymRequestFilters): {
  title: string;
  hint: string;
} {
  if (requestType) {
    return {
      title: "No requests match these filters",
      hint: "Choose another status or request type to see more requests.",
    };
  }
  if (status === "PENDING") {
    return {
      title: "No pending requests",
      hint: "You're all caught up. New gym registrations and access requests show up here for review.",
    };
  }
  if (status === "APPROVED") {
    return {
      title: "No approved requests",
      hint: "Requests you approve show up here.",
    };
  }
  if (status === "REJECTED") {
    return {
      title: "No rejected requests",
      hint: "Requests you reject show up here.",
    };
  }
  return {
    title: "No gym requests yet",
    hint: "Gym registrations and access requests from Visitors show up here.",
  };
}

/**
 * Gym requests page (US-035 criteria 1 and 2), for System Administrators. Other roles see a message
 * instead, and the server refuses them too.
 */
export default function GymRequestsPage() {
  const { user } = useSession();
  return user?.role === ROLES.ADMIN ? (
    <GymRequestList key={user.userId} />
  ) : (
    <AccessRequired
      title="Administrator access required"
      allowed="System Administrators"
    />
  );
}

interface ListState {
  key: string;
  data?: GymRequestPage;
  error?: string;
}

/** The message a page sent back with the link here, such as after a request was deleted. */
function noticeFrom(state: unknown): string {
  const value = (state as { notice?: unknown } | null)?.notice;
  return typeof value === "string" ? value : "";
}

/**
 * The review list: PENDING requests by default, filtered by status and request type from the
 * address. Changing the filters or the page cancels the previous read, so an older answer can't
 * replace a newer one. After a new page, Refresh or Try again, focus moves to the list's heading.
 * A notice sent with the link, such as "Request deleted.", gets focus and stays until the filters
 * or the page change. It's removed from the history entry, so reloading doesn't show it again.
 */
function GymRequestList() {
  const [params, setParams] = useSearchParams();
  const { search, state: locationState } = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(() => noticeFrom(locationState));
  const noticeBox = useRef<HTMLDivElement>(null);
  const { status, requestType, page } = readFilters(params);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ListState | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef(false);
  const key = `${status}|${requestType}|${page}|${revision}`;
  const data = state?.key === key ? (state.data ?? null) : null;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const pastLastPage = Boolean(
    data && data.requests.length === 0 && page > lastPage,
  );
  const loading = state?.key !== key || pastLastPage;
  const error = loading ? "" : (state?.error ?? "");

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = `${status}|${requestType}|${page}|${revision}`;
    listGymRequests({ status, requestType, page }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, data: result });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, error: listProblem(reason) });
      });
    return () => controller.abort();
  }, [status, requestType, page, revision]);

  useEffect(() => {
    if (pastLastPage) {
      setParams(writeFilters({ status, requestType, page: lastPage }), {
        replace: true,
      });
    }
  }, [pastLastPage, status, requestType, lastPage, setParams]);

  useLayoutEffect(() => {
    if (loading || !focusAfterLoad.current) return;
    focusAfterLoad.current = false;
    heading.current?.focus();
  }, [loading]);

  useLayoutEffect(() => {
    if (notice) noticeBox.current?.focus();
  }, [notice]);

  useEffect(() => {
    if (noticeFrom(locationState)) {
      navigate({ search }, { replace: true, state: null });
    }
  }, [locationState, navigate, search]);

  function changeFilters(next: Partial<GymRequestFilters>) {
    setNotice("");
    setParams(writeFilters({ status, requestType, page: 1, ...next }), {
      replace: true,
    });
  }

  function goToPage(next: number) {
    setNotice("");
    focusAfterLoad.current = true;
    setParams(writeFilters({ status, requestType, page: next }), {
      replace: true,
    });
  }

  function reload() {
    focusAfterLoad.current = true;
    setRevision((value) => value + 1);
  }

  const empty = emptyText({ status, requestType, page });

  return (
    <AppLayout title="Gym requests">
      <div className={styles.page}>
        <title>Gym requests | TopSend</title>
        <div className={styles.intro}>
          <p>
            Review gym registrations and Gym Administrator access requests.
            Nobody gets Gym Administrator access until you approve their request
            and they set up their account.
          </p>
        </div>
        {notice && (
          <div
            ref={noticeBox}
            tabIndex={-1}
            role="status"
            className={`${styles.success} ${listStyles.notice}`}
          >
            {notice}
          </div>
        )}
        <section className={styles.card} aria-labelledby="gym-requests-heading">
          <div className={styles.toolbar}>
            <div>
              <h2
                id="gym-requests-heading"
                ref={heading}
                tabIndex={-1}
                className={listStyles.heading}
              >
                Requests
              </h2>
              <p role="status">
                {loading
                  ? "Loading requests…"
                  : data
                    ? countText(data.total, status)
                    : "Requests unavailable"}
              </p>
            </div>
            <label>
              Status
              <select
                value={status}
                onChange={(event) =>
                  changeFilters({
                    status: event.target.value as GymRequestListStatus,
                  })
                }
              >
                {STATUS_FILTERS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Request type
              <select
                value={requestType}
                onChange={(event) =>
                  changeFilters({
                    requestType: event.target.value as GymRequestType | "",
                  })
                }
              >
                {TYPE_FILTERS.map(({ value, label }) => (
                  <option key={value || "ALL"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={reload} disabled={loading}>
              Refresh
            </button>
          </div>

          {loading ? (
            <RequestPlaceholders />
          ) : error ? (
            <div role="alert" className={styles.error}>
              <p>{error}</p>
              <button type="button" onClick={reload}>
                Try again
              </button>
            </div>
          ) : data && data.requests.length > 0 ? (
            <>
              <ul
                className={listStyles.list}
                aria-labelledby="gym-requests-heading"
              >
                {data.requests.map((request) => (
                  <RequestItem
                    key={request.requestId}
                    request={request}
                    listSearch={search}
                  />
                ))}
              </ul>
              {lastPage > 1 && (
                <nav className={styles.pagination} aria-label="Request pages">
                  <button
                    type="button"
                    disabled={data.page <= 1}
                    onClick={() => goToPage(data.page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {data.page} of {lastPage}
                  </span>
                  <button
                    type="button"
                    disabled={data.page >= lastPage}
                    onClick={() => goToPage(data.page + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          ) : (
            <div className={styles.empty}>
              <h3>{empty.title}</h3>
              <p>{empty.hint}</p>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

/**
 * One request in the list (US-035 criteria 1 and 2): the applicant's contact, the request type, the gym,
 * when it was submitted, and its status, with a link that opens its details.
 */
function RequestItem({
  request,
  listSearch,
}: {
  request: GymRequestSummary;
  listSearch: string;
}) {
  const name = applicantName(request.contact);
  const pending = request.status === "PENDING";
  const action = pending ? "Review request" : "View request";
  return (
    <li className={listStyles.item}>
      <div className={listStyles.applicant}>
        <h3>{name}</h3>
        {request.contact.email && request.contact.email !== name && (
          <p>{request.contact.email}</p>
        )}
      </div>
      <dl className={listStyles.facts}>
        <div>
          <dt>Request type</dt>
          <dd>{GYM_REQUEST_TYPE_LABELS[request.requestType] ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Gym</dt>
          <dd>
            {request.gym?.name || "Not given"}
            {request.gym?.location && (
              <span className={listStyles.location}>
                {request.gym.location}
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
        <div>
          <dt>Status</dt>
          <dd>
            <GymRequestStatusBadge status={request.status} />
          </dd>
        </div>
      </dl>
      <Link
        className={listStyles.open}
        data-pending={pending || undefined}
        to={`/admin/gym-requests/${encodeURIComponent(request.requestId)}`}
        state={{ listSearch }}
        aria-label={`${action} from ${name}`}
      >
        {action}
      </Link>
    </li>
  );
}

/** Stand-ins for the list while it loads, so the card keeps its size. */
function RequestPlaceholders() {
  return (
    <ul className={listStyles.list} aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li
          key={row}
          className={`${listStyles.item} ${listStyles.placeholder}`}
        >
          <span />
          <span />
          <span />
        </li>
      ))}
    </ul>
  );
}
