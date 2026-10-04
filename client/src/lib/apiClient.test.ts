import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Retry-After": "0" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("returns the parsed body and always sends cookies", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { status: "ok" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/health")).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/health",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    ]);
  });

  it("sends a JSON body with the JSON content type", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(201, { id: "1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/things", { method: "POST", body: { name: "a" } });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe('{"name":"a"}');
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("turns an API error response into an ApiError with its code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: "INVALID_CREDENTIALS",
          message: "The provided credentials are invalid.",
        }),
      ),
    );

    const error = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {},
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "The provided credentials are invalid.",
    });
  });

  it("retries a GET after a 503 and returns the later success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "UNAVAILABLE" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/health")).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying a GET after two retries", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(503, { error: "UNAVAILABLE", message: "Try later." }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/health")).rejects.toMatchObject({
      status: 503,
      code: "UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never retries a POST", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(503, { error: "UNAVAILABLE", message: "Try later." }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/things", { method: "POST", body: {} }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure as NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(
      apiRequest("/api/things", { method: "POST", body: {} }),
    ).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("reports a timeout as TIMEOUT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    await expect(
      apiRequest("/api/health", { timeoutMs: 20 }),
    ).rejects.toMatchObject({ status: 0, code: "TIMEOUT" });
  });
});
