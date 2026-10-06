import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminDashboard } from "./adminApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const summary = {
  gyms: { total: 12, active: 9, pending: 2, inactive: 1 },
  users: { total: 250, admins: 2, gymAdmins: 18, climbers: 230 },
  pendingRequests: { total: 3, newGyms: 1, existingGyms: 2 },
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(sessionApi.logIn).mockResolvedValue({
    userId: "admin-id",
    role: "ADMIN",
    token: "admin-access-token",
    expiresAt: "2026-10-06T05:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "admin-id",
    email: "admin@example.com",
    role: "ADMIN",
    session: { expiresIn: 3600, limitReached: false },
  });
  await startSession("admin@example.com", "test-password");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the admin dashboard API", () => {
  it("loads the contract counts with the login token and keeps that token out of storage", async () => {
    fetchMock.mockResolvedValue(Response.json(summary));

    await expect(fetchAdminDashboard()).resolves.toEqual(summary);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/dashboard",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: "Bearer admin-access-token",
          Accept: "application/json",
        },
      }),
    );
    expect(
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ).not.toContain("admin-access-token");
  });

  it("refreshes an expired login token and repeats the dashboard read with the replacement", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({
      userId: "admin-id",
      role: "ADMIN",
      token: "replacement-access-token",
      expiresAt: "2026-10-06T05:15:00Z",
    });
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          { error: "TOKEN_EXPIRED", message: "Refresh the token." },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json(summary));

    await expect(fetchAdminDashboard()).resolves.toEqual(summary);

    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/dashboard",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer replacement-access-token",
          Accept: "application/json",
        },
      }),
    );
  });

  it("passes on role rejection without refreshing or retrying a forbidden read", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error: "ROLE_FORBIDDEN",
          message: "You don't have permission to access this resource.",
        },
        { status: 403 },
      ),
    );

    await expect(fetchAdminDashboard()).rejects.toMatchObject({
      status: 403,
      code: "ROLE_FORBIDDEN",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
});
