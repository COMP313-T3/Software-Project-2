import type { Role } from "../constants/roles.ts";
import { apiRequest } from "./apiClient.ts";

/** How long a login session has left, as the API reports it. */
export interface SessionTiming {
  /** Whole seconds until the session ends unless the user is active. */
  expiresIn: number;
  /** True when the session ends at its hard limit, so activity can't make it last longer. */
  limitReached: boolean;
}

/** The logged in user, from GET /api/auth/me. */
export interface CurrentUser {
  userId: string;
  email: string;
  role: Role;
  session: SessionTiming;
}

/** Answer of GET /api/auth/csrf. */
export interface CsrfState {
  /** Token for the X-CSRF-Token header of login, refresh, and log out. */
  csrfToken: string;
  /** Whether the browser has a refresh cookie, which the page can't read itself. */
  sessionCookie: boolean;
}

/** Answer of POST /api/auth/login and POST /api/auth/refresh. */
export interface AccessTokenResult {
  userId: string;
  role: Role;
  /** Access token for the Authorization header. Keep it in memory only. */
  token: string;
  /** When the access token stops working, as an ISO date. */
  expiresAt: string;
}

function csrfHeader(csrfToken: string) {
  return { "X-CSRF-Token": csrfToken };
}

function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Gets the CSRF token that login, refresh, and log out send back. The API also sets it as a cookie.
 *
 * @returns The token, and whether the browser has a refresh cookie.
 * @throws {ApiError} When the API can't be reached.
 */
export function fetchCsrfToken(): Promise<CsrfState> {
  return apiRequest<CsrfState>("/api/auth/csrf");
}

/**
 * Logs in. The API sets the refresh cookie and answers the access token.
 *
 * @param email The email typed in the form.
 * @param password The password typed in the form.
 * @param csrfToken Token from fetchCsrfToken.
 * @throws {ApiError} INVALID_CREDENTIALS, LOGIN_LOCKED, TOO_MANY_REQUESTS, or CSRF_INVALID.
 */
export function logIn(
  email: string,
  password: string,
  csrfToken: string,
): Promise<AccessTokenResult> {
  return apiRequest<AccessTokenResult>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    headers: csrfHeader(csrfToken),
  });
}

/**
 * Swaps the refresh cookie for a new one and a new access token.
 *
 * @param csrfToken Token from fetchCsrfToken.
 * @throws {ApiError} NOT_AUTHENTICATED without a login, SESSION_EXPIRED when it ended, or CSRF_INVALID.
 */
export function refreshSession(csrfToken: string): Promise<AccessTokenResult> {
  return apiRequest<AccessTokenResult>("/api/auth/refresh", {
    method: "POST",
    headers: csrfHeader(csrfToken),
  });
}

/**
 * Logs out: the API ends the session and deletes the login cookies.
 *
 * @param csrfToken Token from fetchCsrfToken.
 * @throws {ApiError} CSRF_INVALID, or when the API can't be reached.
 */
export async function logOut(csrfToken: string): Promise<void> {
  await apiRequest("/api/auth/logout", {
    method: "POST",
    headers: csrfHeader(csrfToken),
  });
}

/**
 * Gets the logged in user and how long their session has left.
 *
 * @param accessToken The access token.
 * @throws {ApiError} TOKEN_EXPIRED when the token needs refreshing, or SESSION_EXPIRED.
 */
export function fetchCurrentUser(accessToken: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>("/api/auth/me", {
    headers: bearer(accessToken),
  });
}

/**
 * Tells the API when the user was last active, which keeps the session going.
 *
 * @param accessToken The access token.
 * @param idleSeconds Seconds since the user's last activity.
 * @returns How long the session has left.
 * @throws {ApiError} TOKEN_EXPIRED when the token needs refreshing, or SESSION_EXPIRED.
 */
export function pingSession(
  accessToken: string,
  idleSeconds: number,
): Promise<SessionTiming> {
  return apiRequest<SessionTiming>("/api/session/ping", {
    method: "POST",
    body: { idleSeconds },
    headers: bearer(accessToken),
  });
}
