import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClimberDetails, removeClimberRegistration, updateClimberDetails } from "./climberDetailsApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "climber-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  await startSession("gym@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function operation(method: string, signal?: AbortSignal) {
  if (method === "GET") return getClimberDetails("event/one", "climber/one", signal);
  if (method === "PATCH") return updateClimberDetails("event/one", "climber/one", { divisionId: "division" }, signal);
  return removeClimberRegistration("event/one", "climber/one", signal);
}

describe("US-015 selected Climber registration API", () => {
  it("reads the encoded competition and Climber user IDs with the private bearer session", async () => {
    fetchMock.mockResolvedValue(Response.json({ registrationId: "registration", status: "CONFIRMED" }));
    await expect(getClimberDetails("event/one", "climber/one")).resolves.toMatchObject({ registrationId: "registration" });
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/climbers/climber%2Fone", expect.objectContaining({
      method: "GET", credentials: "include", headers: { Accept: "application/json", Authorization: "Bearer climber-token" },
    }));
  });
  it("sends only the permitted divisionId field to PATCH", async () => {
    fetchMock.mockResolvedValue(Response.json({ registrationId: "registration", division: { _id: "division", name: "Open" } }));
    const forged = { divisionId: "division", competitionId: "foreign", climberId: "different", email: "forged@example.com", status: "WAITLIST" };
    await updateClimberDetails("event/one", "climber/one", forged);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/climbers/climber%2Fone", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ divisionId: "division" }), headers: expect.objectContaining({ Authorization: "Bearer climber-token" }),
    }));
  });
  it("accepts the empty 204 for removal and sends no deletion body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(removeClimberRegistration("event/one", "climber/one")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/climbers/climber%2Fone", expect.objectContaining({
      method: "DELETE", body: undefined, headers: { Accept: "application/json", Authorization: "Bearer climber-token" },
    }));
  });
  it.each(["GET", "PATCH", "DELETE"])("passes cancellation into %s", async method => {
    fetchMock.mockResolvedValue(method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ registrationId: "registration" }));
    const controller = new AbortController(); await operation(method, controller.signal); controller.abort();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("preserves division validation feedback without repeating the update", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "VALIDATION_ERROR", message: "Check the fields.", fields: { divisionId: "Choose a division from this competition." } }, { status: 400 }));
    await expect(operation("PATCH")).rejects.toMatchObject({ status: 400, fields: { divisionId: "Choose a division from this competition." } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["GET", "PATCH", "DELETE"])("preserves an unavailable registration error for %s", async method => {
    fetchMock.mockResolvedValue(Response.json({ error: "REGISTRATION_NOT_FOUND", message: "Not registered in this competition." }, { status: 404 }));
    await expect(operation(method)).rejects.toMatchObject({ status: 404, code: "REGISTRATION_NOT_FOUND" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["PATCH", "DELETE"])("does not repeat a failed %s after a server error", async method => {
    fetchMock.mockResolvedValue(Response.json({ error: "INTERNAL_ERROR", message: "Try again." }, { status: 503 }));
    await expect(operation(method)).rejects.toMatchObject({ status: 503 }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["PATCH", "DELETE"])("does not repeat a failed %s after a network error", async method => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(operation(method)).rejects.toMatchObject({ code: "NETWORK_ERROR" }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes an expired bearer token after auth rejects an update", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "fresh-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ registrationId: "registration" }));
    await operation("PATCH");
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/competitions/event%2Fone/climbers/climber%2Fone", expect.objectContaining({
      method: "PATCH", headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
    }));
  });
  it("does not refresh credentials or fall back to a public API after access is denied", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "NO_ASSIGNED_GYM", message: "Contact an administrator." }, { status: 403 }));
    await expect(operation("GET")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
});
