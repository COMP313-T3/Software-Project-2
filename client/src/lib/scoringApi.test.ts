import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCompetitionScoring, saveCompetitionScoring } from "./scoringApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "scoring-fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  await startSession("gym@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("US018 protected scoring API adapter", () => {
  it("loads the selected competition's scoring with the shared session", async () => {
    const data = { competitionId: "selected", scoring: { deductionPercent: 20, maxAttempts: 5 }, readiness: { routes: 0, routesWithoutPoints: 0, ready: false, warnings: [] } };
    fetchMock.mockResolvedValue(Response.json(data));
    await expect(getCompetitionScoring("selected")).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/selected/scoring", expect.objectContaining({ headers: { Accept: "application/json", Authorization: "Bearer scoring-fixture-token" } }));
  });
  it("encodes the selected competition ID and forwards cancellation", async () => {
    fetchMock.mockResolvedValue(Response.json({ competitionId: "one/two", scoring: null }));
    const controller = new AbortController(); await getCompetitionScoring("one/two", controller.signal);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/gym-admin/competitions/one%2Ftwo/scoring");
    controller.abort(); expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("saves only the deduction and attempts through PUT for the selected competition", async () => {
    fetchMock.mockResolvedValue(Response.json({ competitionId: "selected", scoring: { deductionPercent: 25, maxAttempts: 4 } }));
    await saveCompetitionScoring("selected", { deductionPercent: 25, maxAttempts: 4, format: "POINTS", flashBonus: 10, competitionId: "other", updatedBy: "forged" } as Parameters<typeof saveCompetitionScoring>[1]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/selected/scoring", expect.objectContaining({ method: "PUT", body: JSON.stringify({ deductionPercent: 25, maxAttempts: 4 }), credentials: "include" }));
  });
  it("preserves validation fields without retrying a failed PUT", async () => {
    const message = "With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores.";
    fetchMock.mockResolvedValue(Response.json({ error: "VALIDATION_ERROR", message: "Check the fields.", fields: { deductionPercent: message } }, { status: 400 }));
    await expect(saveCompetitionScoring("selected", { deductionPercent: 30, maxAttempts: 5 })).rejects.toMatchObject({ status: 400, fields: { deductionPercent: message } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not retry an uncertain network write", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(saveCompetitionScoring("selected", { deductionPercent: 20, maxAttempts: 5 })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("passes access rejection without a public fallback", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "NO_ASSIGNED_GYM", message: "No assigned gym." }, { status: 403 }));
    await expect(getCompetitionScoring("selected")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
  it("refreshes a rejected access token before resending through the same protected route", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "fresh-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 })).mockResolvedValueOnce(Response.json({ competitionId: "selected" }));
    await saveCompetitionScoring("selected", { deductionPercent: 20, maxAttempts: 5 });
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/competitions/selected/scoring", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }) }));
  });
});
