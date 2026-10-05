const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_READ_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const BASE_RETRY_DELAY_MS = 300;
const MAX_RETRY_DELAY_MS = 5_000;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** Extra request headers, such as Authorization. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ApiErrorBody {
  error?: unknown;
  message?: unknown;
  fields?: unknown;
}

/**
 * Error thrown for every failed API call. Network failures use status 0 with
 * the code NETWORK_ERROR, TIMEOUT, or ABORTED.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  /**
   * @param status HTTP status, or 0 when no response arrived.
   * @param code Error code from the API, for example INVALID_CREDENTIALS.
   * @param message Message that is safe to show to users.
   * @param fields Validation messages keyed by field name.
   */
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Calls the TopSend API and returns the parsed JSON response. All API calls go
 * through this function instead of calling fetch directly.
 *
 * Cookies are always sent. Requests time out after 10 seconds by default. GET
 * requests are retried up to twice after a network error or a 429, 502, 503, or
 * 504 response, waiting longer each time and honoring Retry-After. Other methods
 * are never retried, so a write can't be sent twice.
 *
 * @param path API path starting with /api, for example /api/health.
 * @param options Method, JSON body, extra headers, abort signal, and timeout.
 * @returns The parsed response body.
 * @throws {ApiError} When the request fails, times out, is cancelled, or the API responds with an error.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const maxAttempts = method === "GET" ? MAX_READ_RETRIES + 1 : 1;

  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await send(path, method, options);
    } catch (error) {
      if (options.signal?.aborted) {
        throw new ApiError(0, "ABORTED", "The request was cancelled.");
      }
      if (isTimeout(error)) {
        throw new ApiError(
          0,
          "TIMEOUT",
          "The server took too long to respond. Please try again.",
        );
      }
      if (attempt < maxAttempts) {
        await wait(retryDelay(attempt, null));
        continue;
      }
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Couldn't reach the server. Check your connection and try again.",
      );
    }

    if (response.ok) {
      return (await readJson(response)) as T;
    }
    if (attempt < maxAttempts && RETRYABLE_STATUSES.has(response.status)) {
      await wait(retryDelay(attempt, response.headers.get("Retry-After")));
      continue;
    }
    throw await toApiError(response);
  }
}

function send(
  path: string,
  method: HttpMethod,
  options: ApiRequestOptions,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  const hasBody = options.body !== undefined;

  return fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...options.headers,
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal,
  });
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TimeoutError"
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = ((await readJson(response)) as ApiErrorBody) ?? {};
  } catch {
    body = {};
  }

  const code = typeof body.error === "string" ? body.error : "HTTP_ERROR";
  const message =
    typeof body.message === "string"
      ? body.message
      : "Something went wrong. Please try again.";
  const fields =
    body.fields && typeof body.fields === "object"
      ? (body.fields as Record<string, string>)
      : undefined;

  return new ApiError(response.status, code, message, fields);
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  const backoff = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(
    backoff + Math.random() * BASE_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
