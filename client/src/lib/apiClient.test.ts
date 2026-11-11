import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, reloadingAutomatically } from "./apiClient.ts";

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

  it("keeps the details an error carries, such as when a competition starts", async () => {
    const details = { startsAt: "2026-11-14T15:00:00.000Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(409, { error: "COMPETITION_NOT_STARTED", message: "Not yet.", details })),
    );

    await expect(apiRequest("/api/competitions/1/scorecard")).rejects.toMatchObject({
      status: 409,
      code: "COMPETITION_NOT_STARTED",
      details,
    });
  });

  it.each([undefined, null, "soon", ["soon"], 5])("has no details when the error sends %j", async (details) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(409, { error: "COMPETITION_NOT_STARTED", message: "Not yet.", details })),
    );

    const error = await apiRequest("/api/competitions/1/scorecard").catch((problem: unknown) => problem);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toBeUndefined();
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

describe("a page's own reloads", () => {
  function headersOf(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
    return (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("doesn't mark a read the user started", async () => {
    vi.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/my-events");

    expect(headersOf(fetchMock)["X-TopSend-Automatic"]).toBeUndefined();
  });

  it("marks the reads a page starts right after it began reloading by itself", async () => {
    vi.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    reloadingAutomatically();
    vi.advanceTimersByTime(400);
    await apiRequest("/api/my-events");
    await apiRequest("/api/competitions");

    expect(headersOf(fetchMock, 0)["X-TopSend-Automatic"]).toBe("1");
    expect(headersOf(fetchMock, 1)["X-TopSend-Automatic"]).toBe("1");
  });

  it("stops marking reads a moment later", async () => {
    vi.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    reloadingAutomatically();
    vi.advanceTimersByTime(1600);
    await apiRequest("/api/my-events");

    expect(headersOf(fetchMock)["X-TopSend-Automatic"]).toBeUndefined();
  });

  it("never marks a write, which is always the user's own", async () => {
    vi.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    reloadingAutomatically();
    await apiRequest("/api/things", { method: "POST", body: {} });
    await apiRequest("/api/things/1", { method: "DELETE" });

    expect(headersOf(fetchMock, 0)["X-TopSend-Automatic"]).toBeUndefined();
    expect(headersOf(fetchMock, 1)["X-TopSend-Automatic"]).toBeUndefined();
  });

  it("keeps the caller's own headers on a marked read", async () => {
    vi.useFakeTimers({ now: new Date("2020-01-01T00:00:00Z") });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    reloadingAutomatically();
    await apiRequest("/api/my-events", { headers: { Authorization: "Bearer token" } });

    expect(headersOf(fetchMock)).toMatchObject({ Authorization: "Bearer token", "X-TopSend-Automatic": "1" });
  });
});
