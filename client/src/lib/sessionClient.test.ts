import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient.ts";
import * as sessionApi from "./sessionApi.ts";
import {
  endSession,
  forgetSession,
  keepAlive,
  resumeSession,
  startSession,
} from "./sessionClient.ts";

const USER: sessionApi.CurrentUser = {
  userId: "507f1f77bcf86cd799439011",
  email: "jordan@example.com",
  role: "CLIMBER",
  session: { expiresIn: 3600, limitReached: false },
};

function tokenResult(token: string): sessionApi.AccessTokenResult {
  return {
    userId: USER.userId,
    role: "CLIMBER",
    token,
    expiresAt: "2026-10-05T14:15:00.000Z",
  };
}

function apiError(status: number, code: string) {
  return new ApiError(status, code, `${code} message`);
}

let csrfTokens: number;

beforeEach(() => {
  csrfTokens = 0;
  vi.mocked(sessionApi.fetchCsrfToken).mockImplementation(async () => {
    csrfTokens += 1;
    return { csrfToken: `csrf-${csrfTokens}`, sessionCookie: true };
  });
  vi.mocked(sessionApi.logIn).mockResolvedValue(tokenResult("access-1"));
  vi.mocked(sessionApi.refreshSession).mockResolvedValue(
    tokenResult("access-2"),
  );
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue(USER);
  vi.mocked(sessionApi.pingSession).mockResolvedValue(USER.session);
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});

afterEach(() => {
  forgetSession();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("session client", () => {
  it("logs in with a CSRF token and loads the user with the access token, keeping it in memory", async () => {
    await expect(startSession("jordan@example.com", "pw")).resolves.toEqual(
      USER,
    );

    expect(sessionApi.logIn).toHaveBeenCalledWith(
      "jordan@example.com",
      "pw",
      "csrf-1",
    );
    expect(sessionApi.fetchCurrentUser).toHaveBeenCalledWith("access-1");
    expect(sessionApi.refreshSession).not.toHaveBeenCalled();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("gets a new CSRF token and tries once more when the old one is refused", async () => {
    vi.mocked(sessionApi.logIn)
      .mockRejectedValueOnce(apiError(403, "CSRF_INVALID"))
      .mockResolvedValueOnce(tokenResult("access-1"));

    await startSession("jordan@example.com", "pw");

    expect(sessionApi.logIn).toHaveBeenLastCalledWith(
      "jordan@example.com",
      "pw",
      "csrf-2",
    );
  });

  it("asks for a new CSRF token after logging in, since the old one belonged to no login", async () => {
    await startSession("jordan@example.com", "pw");

    await endSession();

    expect(sessionApi.logOut).toHaveBeenCalledWith("csrf-2");
  });

  it("refreshes an access token that ran out, then repeats the request", async () => {
    await startSession("jordan@example.com", "pw");
    vi.mocked(sessionApi.pingSession).mockRejectedValueOnce(
      apiError(401, "TOKEN_EXPIRED"),
    );

    await keepAlive(30);

    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(sessionApi.pingSession).toHaveBeenLastCalledWith("access-2", 30);
  });

  it("refreshes a token the API no longer accepts, such as after it restarted with a new key", async () => {
    await startSession("jordan@example.com", "pw");
    vi.mocked(sessionApi.pingSession).mockRejectedValueOnce(
      apiError(401, "NOT_AUTHENTICATED"),
    );

    await keepAlive(0);

    expect(sessionApi.pingSession).toHaveBeenLastCalledWith("access-2", 0);
  });

  it("refreshes once for requests made at the same time", async () => {
    await Promise.all([resumeSession(), keepAlive(0), keepAlive(0)]);

    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
  });

  it("shares one CSRF request between callers, so the page and the cookie keep the same token", async () => {
    await Promise.all([resumeSession(), resumeSession()]);

    expect(sessionApi.fetchCsrfToken).toHaveBeenCalledOnce();
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(sessionApi.refreshSession).toHaveBeenCalledWith("csrf-1");
  });

  it("refreshes one tab at a time with the browser's lock", async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) =>
      task(),
    );
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });

    await resumeSession();

    expect(request).toHaveBeenCalledWith(
      "topsend-session-refresh",
      expect.any(Function),
    );
  });

  it("doesn't try to refresh when the browser has no refresh cookie", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
      csrfToken: "csrf-1",
      sessionCookie: false,
    });

    await expect(resumeSession()).resolves.toBeNull();

    expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });

  it("passes on the reason a login can't be picked up", async () => {
    vi.mocked(sessionApi.refreshSession).mockRejectedValue(
      apiError(401, "SESSION_EXPIRED"),
    );

    await expect(resumeSession()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("ignores a refresh that finishes after the tokens were forgotten", async () => {
    let finish: (result: sessionApi.AccessTokenResult) => void = () => {};
    vi.mocked(sessionApi.refreshSession).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const resuming = resumeSession();
    await vi.waitFor(() =>
      expect(sessionApi.refreshSession).toHaveBeenCalled(),
    );

    forgetSession();
    finish(tokenResult("stale-token"));
    await resuming;

    expect(sessionApi.fetchCurrentUser).not.toHaveBeenCalledWith("stale-token");
  });

  it("keeps the tokens when logging out can't reach the server", async () => {
    await startSession("jordan@example.com", "pw");
    vi.mocked(sessionApi.logOut).mockRejectedValue(
      apiError(0, "NETWORK_ERROR"),
    );

    await expect(endSession()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await keepAlive(0);

    expect(sessionApi.pingSession).toHaveBeenCalledWith("access-1", 0);
  });
});
