import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient.ts";
import { getOfficialResult, getResultOptions, recordOfficialAttempt, saveOfficialResult } from "./resultsApi.ts";
import { emptyResultEntry, resultOptions, savedResult, RESULT_COMPETITION, RESULT_CLIMBER, RESULT_ROUTE, RESULT_OTHER_ROUTE } from "../test/resultEntryFixtures.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
const ids = { competitionId: RESULT_COMPETITION, climberId: RESULT_CLIMBER, routeId: RESULT_ROUTE };
const path = `/api/gym-admin/competitions/${RESULT_COMPETITION}/climbers/${RESULT_CLIMBER}/routes/${RESULT_ROUTE}`;
const signal = new AbortController().signal;
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
describe("US-019 Result API adapter", () => {
  it("loads the selected competition's actual entry options with the existing bearer session", async () => {
    vi.mocked(apiRequest).mockResolvedValue(resultOptions);
    await expect(getResultOptions(RESULT_COMPETITION, signal)).resolves.toEqual(resultOptions);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(`/api/gym-admin/competitions/${RESULT_COMPETITION}/results/options`, { method: "GET", signal, headers: { Authorization: "Bearer test-token" } });
  });
  it.each([
    null, { ...resultOptions, competition: { ...resultOptions.competition, _id: "another" } },
    { ...resultOptions, scoring: undefined }, { ...resultOptions, scoring: null },
    { ...resultOptions, climbers: [{ ...resultOptions.climbers[0], registrationStatus: "WAITLIST" }] },
    { ...resultOptions, routes: [{ ...resultOptions.routes[0], pointValue: -1 }] },
    { ...resultOptions, canRecord: { allowed: "yes", reasons: [] } },
  ])("rejects incomplete or out-of-scope option responses %#", async value => {
    vi.mocked(apiRequest).mockResolvedValue(value); await expect(getResultOptions(RESULT_COMPETITION)).rejects.toThrow();
  });
  it("accepts null scoring when recording is explicitly blocked and preserves zero-point problems", async () => {
    const blocked = { ...resultOptions, scoring: null, canRecord: { allowed: false, reasons: ["Set scoring."] }, routes: [{ ...resultOptions.routes[0], pointValue: 0 }] };
    vi.mocked(apiRequest).mockResolvedValue(blocked); await expect(getResultOptions(RESULT_COMPETITION)).resolves.toEqual(blocked);
  });
  it("loads a null result without inventing an official score", async () => {
    vi.mocked(apiRequest).mockResolvedValue(emptyResultEntry);
    expect((await getOfficialResult(ids, signal)).result).toBeNull();
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(path + "/result", { method: "GET", signal, headers: { Authorization: "Bearer test-token" } });
  });
  it("encodes every selected identifier", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...emptyResultEntry, competitionId: "comp/id", climber: { ...emptyResultEntry.climber, _id: "climber/id" }, route: { ...emptyResultEntry.route, _id: "route/id" } });
    await getOfficialResult({ competitionId: "comp/id", climberId: "climber/id", routeId: "route/id" });
    expect(apiRequest).toHaveBeenCalledWith("/api/gym-admin/competitions/comp%2Fid/climbers/climber%2Fid/routes/route%2Fid/result", expect.any(Object));
  });
  it.each([
    null, { ...emptyResultEntry, competitionId: "another" },
    { ...emptyResultEntry, route: { ...emptyResultEntry.route, _id: RESULT_OTHER_ROUTE } },
    { ...emptyResultEntry, attemptsLeft: -1 }, { ...emptyResultEntry, result: undefined },
    { ...savedResult(), result: { ...savedResult().result, climberId: "another" } },
    savedResult({ officialScore: -1 }), savedResult({ officialScore: 2.5 }), savedResult({ sends: 0 }), savedResult({ flash: false }),
  ])("rejects an incomplete, inconsistent or wrong selected result %#", async value => {
    vi.mocked(apiRequest).mockResolvedValue(value); await expect(getOfficialResult(ids)).rejects.toThrow();
  });
  it("PUTs only attempts and sent; flash, score, identity and actor fields are never submitted", async () => {
    const saved = savedResult({ attempts: 2, sent: true, sends: 1, flash: false, officialScore: 80 }); vi.mocked(apiRequest).mockResolvedValue(saved);
    const response = await saveOfficialResult(ids, { attempts: 2, sent: true, flash: false, officialScore: 9999, source: "AI", climberId: "forged" } as never, signal);
    expect(response.result?.officialScore).toBe(80);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(path + "/result", { method: "PUT", body: { attempts: 2, sent: true }, signal, headers: { Authorization: "Bearer test-token" } });
  });
  it("rejects a success response that did not save the submitted totals", async () => {
    vi.mocked(apiRequest).mockResolvedValue(savedResult()); await expect(saveOfficialResult(ids, { attempts: 2, sent: true })).rejects.toThrow("did not confirm");
  });
  it("POSTs one attempt, leaving counts and flash determination to the server", async () => {
    const saved = savedResult({ attempts: 1, sent: false, sends: 0, flash: false, officialScore: 0 }); vi.mocked(apiRequest).mockResolvedValue(saved);
    await expect(recordOfficialAttempt(ids, false, signal)).resolves.toEqual(saved);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(path + "/attempts", { method: "POST", body: { sent: false }, signal, headers: { Authorization: "Bearer test-token" } });
  });
  it("refuses an unconfirmed POST outcome", async () => {
    vi.mocked(apiRequest).mockResolvedValue(savedResult()); await expect(recordOfficialAttempt(ids, false)).rejects.toThrow("not confirmed");
  });
  it.each([0, 400, 401, 403, 404, 409, 429, 500, 503])("preserves errors without automatically resending an attempt (%s)", async status => {
    const error = new ApiError(status, "REJECTED", "Rejected"); vi.mocked(apiRequest).mockRejectedValue(error);
    await expect(recordOfficialAttempt(ids, true)).rejects.toBe(error); expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
