import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGymAdminDashboard, getManagedCompetition, listManagedCompetitions } from "./gymAdminApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "test-gym-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  await startSession("gym@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("US-011 private gym-admin API adapter", () => {
  it("loads the dashboard with the in-memory session token", async () => {
    const data = { gyms: [], counts: { upcoming: 0, past: 0, drafts: 0 }, upcoming: [] };
    fetchMock.mockResolvedValue(Response.json(data));
    await expect(fetchGymAdminDashboard()).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/dashboard", expect.objectContaining({ method: "GET", headers: { Accept: "application/json", Authorization: "Bearer test-gym-token" } }));
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain("test-gym-token");
  });
  it("passes period, selected gym, page and fixed page size to the scoped list", async () => {
    const signal = new AbortController().signal;
    fetchMock.mockResolvedValue(Response.json({ competitions: [], total: 0, page: 2, limit: 20 }));
    await listManagedCompetitions({ period: "past", gymId: "gym-one", page: 2 }, signal);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions?period=past&page=2&limit=20&gymId=gym-one", expect.objectContaining({ method: "GET" }));
  });
  it("omits a gym filter when all assigned gyms are selected", async () => {
    fetchMock.mockResolvedValue(Response.json({ competitions: [], total: 0, page: 1, limit: 20 }));
    await listManagedCompetitions({ period: "upcoming", page: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gym-admin/competitions?period=upcoming&page=1&limit=20");
  });
  it("encodes the selected competition ID without switching endpoints", async () => {
    fetchMock.mockResolvedValue(Response.json({ _id: "event" }));
    await getManagedCompetition("event/one");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gym-admin/competitions/event%2Fone");
  });
  it("refreshes an expired access token before repeating the private read", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "refreshed-gym-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login" }, { status: 401 })).mockResolvedValueOnce(Response.json({ gyms: [] }));
    await fetchGymAdminDashboard();
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/dashboard", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer refreshed-gym-token" }) }));
  });
  it("passes assignment rejection through without retry or public fallback", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "NO_ASSIGNED_GYM", message: "Contact a System Administrator." }, { status: 403 }));
    await expect(fetchGymAdminDashboard()).rejects.toMatchObject({ status: 403, code: "NO_ASSIGNED_GYM" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
});
