import { ApiError } from "./apiClient.ts";
import * as sessionApi from "./sessionApi.ts";
import type { CurrentUser, SessionTiming } from "./sessionApi.ts";

const REFRESH_LOCK = "topsend-session-refresh";

let accessToken = "";
let csrfToken = "";
let refreshing: Promise<void> | null = null;
let fetchingCsrfToken: Promise<sessionApi.CsrfState> | null = null;
let generation = 0;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/**
 * Gets a new CSRF token, sharing one request between callers. Two answers at once would each set
 * a different token in the cookie, and the page would keep the one the cookie no longer has.
 */
function freshCsrfToken(): Promise<sessionApi.CsrfState> {
  fetchingCsrfToken ??= sessionApi
    .fetchCsrfToken()
    .then((state) => {
      csrfToken = state.csrfToken;
      return state;
    })
    .finally(() => {
      fetchingCsrfToken = null;
    });
  return fetchingCsrfToken;
}

async function withCsrfToken<T>(
  send: (token: string) => Promise<T>,
): Promise<T> {
  if (!csrfToken) await freshCsrfToken();
  try {
    return await send(csrfToken);
  } catch (error) {
    if (!hasCode(error, "CSRF_INVALID")) throw error;
    await freshCsrfToken();
    return send(csrfToken);
  }
}

/**
 * Runs one refresh at a time across every tab, where the browser supports it. Two tabs swapping
 * the same refresh cookie at once would look like a stolen cookie, and end the session.
 */
function oneTabAtATime<T>(task: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}

function refresh(): Promise<void> {
  if (!refreshing) {
    const startedIn = generation;
    refreshing = oneTabAtATime(() => withCsrfToken(sessionApi.refreshSession))
      .then((result) => {
        if (generation === startedIn) accessToken = result.token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * Sends a request with the access token. A token that ran out, or that the API no longer accepts
 * (such as after the API restarted with a new key), is refreshed once and the request repeated.
 */
export async function withAccessToken<T>(
  send: (token: string) => Promise<T>,
): Promise<T> {
  if (!accessToken) await refresh();
  try {
    return await send(accessToken);
  } catch (error) {
    if (
      !hasCode(error, "TOKEN_EXPIRED") &&
      !hasCode(error, "NOT_AUTHENTICATED")
    ) {
      throw error;
    }
    await refresh();
    return send(accessToken);
  }
}

/**
 * Whether an error means the login is gone, so the app should treat the user as logged out.
 *
 * @param error An error from a session call.
 */
export function endsSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Whether an error means a login existed but ended, rather than there being none at all.
 *
 * @param error An error from resumeSession.
 */
export function isExpiredSession(error: unknown): boolean {
  return hasCode(error, "SESSION_EXPIRED");
}

/**
 * Logs in and loads the user. The access token stays in this module's memory, never in browser
 * storage.
 *
 * @param email The email typed in the form.
 * @param password The password typed in the form.
 * @returns The logged in user and how long their session has left.
 * @throws {ApiError} With a message to show, such as "Email or password is incorrect."
 */
export async function startSession(
  email: string,
  password: string,
): Promise<CurrentUser> {
  const result = await withCsrfToken((token) =>
    sessionApi.logIn(email, password, token),
  );
  generation += 1;
  accessToken = result.token;
  csrfToken = "";
  return withAccessToken(sessionApi.fetchCurrentUser);
}

/**
 * Picks up a login from the refresh cookie, such as after a reload. Without a refresh cookie it
 * doesn't ask, so a visit while logged out makes no failing request.
 *
 * @returns The logged in user and how long their session has left, or null without a login.
 * @throws {ApiError} SESSION_EXPIRED when the login ended.
 */
export async function resumeSession(): Promise<CurrentUser | null> {
  const { sessionCookie } = await freshCsrfToken();
  if (!sessionCookie) return null;
  await refresh();
  return withAccessToken(sessionApi.fetchCurrentUser);
}

/**
 * Logs out on the server, which deletes the login cookies, then forgets the tokens.
 *
 * @throws {ApiError} When the API can't be reached, so the login is still there.
 */
export async function endSession(): Promise<void> {
  await withCsrfToken(sessionApi.logOut);
  forgetSession();
}

/**
 * Tells the API when the user was last active.
 *
 * @param idleSeconds Seconds since the user's last activity.
 * @returns How long the session has left.
 * @throws {ApiError} SESSION_EXPIRED when the session already ended.
 */
export function keepAlive(idleSeconds: number): Promise<SessionTiming> {
  return withAccessToken((token) => sessionApi.pingSession(token, idleSeconds));
}

/**
 * Drops the tokens held in memory, and ignores a refresh still on its way.
 */
export function forgetSession(): void {
  generation += 1;
  accessToken = "";
  csrfToken = "";
}
