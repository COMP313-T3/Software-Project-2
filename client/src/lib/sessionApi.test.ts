import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCsrfToken,
  fetchCurrentUser,
  logIn,
  logOut,
  pingSession,
  refreshSession,
} from "./sessionApi.ts";

vi.unmock("./sessionApi.ts");

function respondWith(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof respondWith>) {
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url,
    method: init?.method,
    headers: init?.headers as Record<string, string>,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session API", () => {
  it("gets the CSRF token and whether there is a refresh cookie", async () => {
    const fetchMock = respondWith(200, {
      csrfToken: "csrf-1",
      sessionCookie: true,
    });

    await expect(fetchCsrfToken()).resolves.toEqual({
      csrfToken: "csrf-1",
      sessionCookie: true,
    });
    expect(sent(fetchMock)).toMatchObject({
      url: "/api/auth/csrf",
      method: "GET",
    });
  });

  it("logs in with the CSRF token in its header", async () => {
    const fetchMock = respondWith(200, { token: "access-1" });

    await logIn("jordan@example.com", "pw", "csrf-1");

    expect(sent(fetchMock)).toMatchObject({
      url: "/api/auth/login",
      method: "POST",
      headers: { "X-CSRF-Token": "csrf-1" },
      body: { email: "jordan@example.com", password: "pw" },
    });
  });

  it("refreshes and logs out with the CSRF token, never retrying", async () => {
    const refreshMock = respondWith(200, { token: "access-2" });
    await refreshSession("csrf-1");
    expect(sent(refreshMock)).toMatchObject({
      url: "/api/auth/refresh",
      method: "POST",
      headers: { "X-CSRF-Token": "csrf-1" },
    });

    const logOutMock = respondWith(503);
    await expect(logOut("csrf-1")).rejects.toBeTruthy();
    expect(logOutMock).toHaveBeenCalledOnce();
  });

  it("sends the access token to load the user and keep the session going", async () => {
    const meMock = respondWith(200, { email: "jordan@example.com" });
    await fetchCurrentUser("access-1");
    expect(sent(meMock)).toMatchObject({
      url: "/api/auth/me",
      headers: { Authorization: "Bearer access-1" },
    });

    const pingMock = respondWith(200, { expiresIn: 3600 });
    await pingSession("access-1", 42);
    expect(sent(pingMock)).toMatchObject({
      url: "/api/session/ping",
      method: "POST",
      headers: { Authorization: "Bearer access-1" },
      body: { idleSeconds: 42 },
    });
  });
});
