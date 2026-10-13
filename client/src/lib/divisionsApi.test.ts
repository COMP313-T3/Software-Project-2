import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignClimberDivision, createCompetitionDivision, listCompetitionClimbers, listCompetitionDivisions } from "./divisionsApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "test-division-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  await startSession("gym@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("competition-scoped division API", () => {
  it("lists divisions through the private API with the shared bearer session", async () => {
    fetchMock.mockResolvedValue(Response.json({ divisions: [] }));
    await expect(listCompetitionDivisions("event/one")).resolves.toEqual({ divisions: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/divisions", expect.objectContaining({
      method: "GET", credentials: "include", headers: { Accept: "application/json", Authorization: "Bearer test-division-token" },
    }));
  });
  it("lists climbers without a division filter", async () => {
    fetchMock.mockResolvedValue(Response.json({ climbers: [], total: 0 }));
    await expect(listCompetitionClimbers("event")).resolves.toEqual({ climbers: [], total: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gym-admin/competitions/event/climbers");
  });
  it("encodes the selected division query", async () => {
    fetchMock.mockResolvedValue(Response.json({ climbers: [], total: 0 }));
    await listCompetitionClimbers("event/one", "division/one");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gym-admin/competitions/event%2Fone/climbers?divisionId=division%2Fone");
  });
  it("creates a division with only the supported name field", async () => {
    fetchMock.mockResolvedValue(Response.json({ _id: "division", competitionId: "event", name: "Open", climberCount: 0 }, { status: 201 }));
    const forged = { name: "Open", competitionId: "foreign-event", createdBy: "forged-admin", description: "unsupported" };
    await createCompetitionDivision("event", forged);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event/divisions", expect.objectContaining({
      method: "POST", body: JSON.stringify({ name: "Open" }), headers: expect.objectContaining({ Authorization: "Bearer test-division-token" }),
    }));
  });
  it("uses the climber user ID in the scoped PUT and sends only divisionId", async () => {
    fetchMock.mockResolvedValue(Response.json({ registrationId: "registration" }));
    await assignClimberDivision("event/one", "climber/one", "division");
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/climbers/climber%2Fone/division", expect.objectContaining({
      method: "PUT", body: JSON.stringify({ divisionId: "division" }),
    }));
  });
  it("passes cancellation into a read", async () => {
    fetchMock.mockResolvedValue(Response.json({ divisions: [] }));
    const controller = new AbortController();
    await listCompetitionDivisions("event", controller.signal);
    controller.abort();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("passes cancellation into a write", async () => {
    fetchMock.mockResolvedValue(Response.json({ registrationId: "registration" }));
    const controller = new AbortController();
    await assignClimberDivision("event", "climber", "division", controller.signal);
    controller.abort();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("preserves duplicate name feedback without retrying creation", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "DIVISION_EXISTS", message: "Already exists.", fields: { name: "Choose another name." } }, { status: 409 }));
    await expect(createCompetitionDivision("event", { name: "Open" })).rejects.toMatchObject({ status: 409, code: "DIVISION_EXISTS", fields: { name: "Choose another name." } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("preserves division validation feedback without retrying an assignment", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "VALIDATION_ERROR", message: "Check the fields.", fields: { divisionId: "Choose a division from this competition." } }, { status: 400 }));
    await expect(assignClimberDivision("event", "climber", "foreign")).rejects.toMatchObject({ status: 400, fields: { divisionId: "Choose a division from this competition." } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["POST", "PUT"])("does not repeat a failed %s after a server error", async method => {
    fetchMock.mockResolvedValue(Response.json({ error: "INTERNAL_ERROR", message: "Try again." }, { status: 503 }));
    const operation = method === "POST" ? createCompetitionDivision("event", { name: "Open" }) : assignClimberDivision("event", "climber", "division");
    await expect(operation).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["POST", "PUT"])("does not repeat a failed %s after a network error", async method => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const operation = method === "POST" ? createCompetitionDivision("event", { name: "Open" }) : assignClimberDivision("event", "climber", "division");
    await expect(operation).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes an expired bearer token before resending an assignment rejected by auth", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "fresh-division-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ registrationId: "registration" }));
    await assignClimberDivision("event", "climber", "division");
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/competitions/event/climbers/climber/division", expect.objectContaining({
      method: "PUT", body: JSON.stringify({ divisionId: "division" }), headers: expect.objectContaining({ Authorization: "Bearer fresh-division-token" }),
    }));
  });
  it("does not refresh or use a public endpoint after gym access is denied", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "NO_ASSIGNED_GYM", message: "Contact an administrator." }, { status: 403 }));
    await expect(listCompetitionDivisions("event")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
});
