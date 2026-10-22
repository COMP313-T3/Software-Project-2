import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createManagedCompetition, fetchGymAdminDashboard, getManagedCompetition, listManagedCompetitions, updateManagedCompetition } from "./gymAdminApi.ts";
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

describe("US-011/US-012 private gym-admin API adapter", () => {
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
  it("updates the selected competition through the private API", async () => {
    fetchMock.mockResolvedValue(Response.json({ _id: "event-one" }));
    const details = { name: "Updated event", capacity: 60, registrationStatus: "CLOSED" as const };
    await updateManagedCompetition("event/one", details);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/gym-admin/competitions/event%2Fone");
    expect(options?.method).toBe("PATCH");
    expect(options?.body).toBe(JSON.stringify(details));
    expect(options?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: expect.stringMatching(/^Bearer /),
      "Content-Type": "application/json",
    });
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
  it("creates a competition with the shared bearer session and only permitted creation fields", async () => {
    const controller = new AbortController();
    const data = { _id: "created-competition", gymId: "assigned-gym", capacity: 80 };
    fetchMock.mockResolvedValue(Response.json(data, { status: 201 }));
    const details = { name: "Autumn Open", date: "2026-11-14", capacity: 80, status: "PUBLISHED", registrationStatus: "OPEN", createdBy: "forged-user" };
    await expect(createManagedCompetition(details, controller.signal)).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions", expect.objectContaining({
      method: "POST", credentials: "include",
      headers: { Accept: "application/json", Authorization: "Bearer test-gym-token", "Content-Type": "application/json" },
      body: JSON.stringify({ name: details.name, date: details.date, capacity: 80 }),
    }));
    const signal = fetchMock.mock.calls[0][1]?.signal;
    controller.abort(); expect(signal?.aborted).toBe(true);
  });
  it("includes an authorized gym choice and optional content without renaming the API fields", async () => {
    fetchMock.mockResolvedValue(Response.json({ _id: "created" }, { status: 201 }));
    await createManagedCompetition({ name: "Open", date: "2026-11-14", capacity: 40, gymId: "assigned-gym", location: "Toronto", description: "Local event" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: "Open", date: "2026-11-14", capacity: 40, gymId: "assigned-gym", location: "Toronto", description: "Local event",
    });
  });
  it("sends the scoring settings chosen for a competition, including a zero deduction", async () => {
    fetchMock.mockResolvedValue(Response.json({ _id: "created" }, { status: 201 }));
    await createManagedCompetition({ name: "Open", date: "2026-11-14", capacity: 40, deductionPercent: 0, maxAttempts: 8 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: "Open", date: "2026-11-14", capacity: 40, deductionPercent: 0, maxAttempts: 8,
    });
  });
  it("passes duplicate field feedback through without automatically retrying the POST", async () => {
    const message = "Your gym already has a competition with this name on this date.";
    fetchMock.mockResolvedValue(Response.json({ error: "COMPETITION_EXISTS", message, fields: { name: message } }, { status: 409 }));
    await expect(createManagedCompetition({ name: "Open", date: "2026-11-14", capacity: 40 })).rejects.toMatchObject({
      status: 409, code: "COMPETITION_EXISTS", fields: { name: message },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not retry a POST after a temporary server failure", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "INTERNAL_ERROR", message: "Try again." }, { status: 503 }));
    await expect(createManagedCompetition({ name: "Open", date: "2026-11-14", capacity: 40 })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not retry a POST after a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(createManagedCompetition({ name: "Open", date: "2026-11-14", capacity: 40 })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes a rejected access token before retrying creation through the same protected route", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "refreshed-gym-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ _id: "created" }, { status: 201 }));
    await createManagedCompetition({ name: "Open", date: "2026-11-14", capacity: 40 });
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/competitions", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Bearer refreshed-gym-token" }),
    }));
  });
});
