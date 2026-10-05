import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient.ts";
import {
  checkResetLink,
  requestPasswordReset,
  resetPassword,
} from "./authApi.ts";

function apiAnswers(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof apiAnswers>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  return { url, method: init.method, body: JSON.parse(String(init.body)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("password reset calls", () => {
  it("asks for a reset link", async () => {
    const fetchMock = apiAnswers({ status: "requested" }, 202);

    await requestPasswordReset("jordan@example.com");

    expect(sent(fetchMock)).toEqual({
      url: "/api/auth/forgot-password",
      method: "POST",
      body: { email: "jordan@example.com" },
    });
  });

  it("checks a link and returns the account's email", async () => {
    const fetchMock = apiAnswers({ email: "jordan@example.com" });

    await expect(checkResetLink("token-from-email")).resolves.toEqual({
      email: "jordan@example.com",
    });
    expect(sent(fetchMock)).toEqual({
      url: "/api/auth/reset-password/check",
      method: "POST",
      body: { token: "token-from-email" },
    });
  });

  it("sends the new password with the token", async () => {
    const fetchMock = apiAnswers({ status: "reset" });

    await resetPassword("token-from-email", "Crimp hard 2 the top");

    expect(sent(fetchMock)).toEqual({
      url: "/api/auth/reset-password",
      method: "POST",
      body: { token: "token-from-email", password: "Crimp hard 2 the top" },
    });
  });

  it("reports a link that no longer works with its code", async () => {
    apiAnswers(
      { error: "RESET_LINK_INVALID", message: "This reset link has expired." },
      400,
    );

    const failure = await resetPassword("old", "Crimp hard 2 the top").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("RESET_LINK_INVALID");
  });
});
