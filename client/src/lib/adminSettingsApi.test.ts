import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSystemSettings,
  saveSystemSettings,
} from "./adminApi.ts";
import { startSession } from "./sessionClient.ts";
import * as sessionApi from "./sessionApi.ts";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(sessionApi.logIn).mockResolvedValue({
    userId: "admin-id",
    role: "ADMIN",
    token: "admin-token",
    expiresAt: "2040-01-01T00:00:00Z",
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

describe("US-010 system settings API adapter", () => {
  it("loads saved settings with the ADMIN bearer token", async () => {
    const settings = {
      platformName: "TopSend",
      climberRegistrationEnabled: true,
    };
    fetchMock.mockResolvedValueOnce(Response.json(settings));

    await expect(fetchSystemSettings()).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/settings",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer admin-token",
        },
      }),
    );
  });

  it("patches only the submitted settings", async () => {
    const settings = {
      platformName: "Boulder Hub",
      climberRegistrationEnabled: true,
    };
    fetchMock.mockResolvedValueOnce(Response.json(settings));

    await expect(
      saveSystemSettings({ platformName: "Boulder Hub" }),
    ).resolves.toEqual(settings);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ platformName: "Boulder Hub" }),
      headers: {
        Accept: "application/json",
        Authorization: "Bearer admin-token",
      },
    });
  });
});
