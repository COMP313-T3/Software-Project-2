import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkedRegistrationResult, registerForEvent, type EventRegistrationInput } from "./eventRegistrationApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const fetchMock = vi.fn<typeof fetch>();
const input = { climberId: "signed-in-climber", divisionId: "division-one" };
const result = { registrationId: "registration-one", competitionId: "event-one", divisionId: input.divisionId, status: "CONFIRMED" };
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: input.climberId, role: "CLIMBER", token: "registration-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: input.climberId, email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  await startSession("climber@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("US-028 prepared registration API adapter (contract tests with fixtures)", () => {
  it("uses the documented POST with an encoded event ID, bearer session and permitted input only", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...result, competitionId: "event/one" }, { status: 201 }));
    await registerForEvent("event/one", { ...input, status: "CONFIRMED", capacity: 999, competitionId: "forged" } as EventRegistrationInput);
    expect(fetchMock).toHaveBeenCalledWith("/api/competitions/event%2Fone/registrations", expect.objectContaining({
      method: "POST", credentials: "include", headers: { Accept: "application/json", Authorization: "Bearer registration-token", "Content-Type": "application/json" },
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input);
  });
  it("returns a matching server-confirmed registration", async () => {
    fetchMock.mockResolvedValue(Response.json(result, { status: 201 }));
    await expect(registerForEvent("event-one", input)).resolves.toEqual(result);
  });
  it.each([400, 403, 404, 409, 503])("does not automatically retry a rejected registration (%s)", async status => {
    fetchMock.mockResolvedValue(Response.json({ error: "REQUEST_FAILED", message: "Registration unavailable.", fields: { divisionId: "Choose another division." } }, { status }));
    await expect(registerForEvent("event-one", input)).rejects.toMatchObject({ status, fields: { divisionId: "Choose another division." } });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
  it("does not retry an unconfirmed POST after a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(registerForEvent("event-one", input)).rejects.toMatchObject({ code: "NETWORK_ERROR" }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes an explicitly rejected token before resending the protected request", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: input.climberId, role: "CLIMBER", token: "fresh-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 })).mockResolvedValueOnce(Response.json(result, { status: 201 }));
    await registerForEvent("event-one", input); expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/competitions/event-one/registrations", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }) }));
  });
  it("forwards cancellation to the request", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    const operation = registerForEvent("event-one", input, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); controller.abort(); await expect(operation).rejects.toMatchObject({ code: "ABORTED" });
  });
  it.each([
    null, {}, { ...result, registrationId: "" }, { ...result, competitionId: "another-event" },
    { ...result, divisionId: "another-division" }, { ...result, status: "SUCCESS" },
  ])("rejects an incomplete or mismatched success reply: %s", async data => {
    fetchMock.mockResolvedValue(Response.json(data, { status: 201 }));
    await expect(registerForEvent("event-one", input)).rejects.toThrow(/could not be confirmed/);
  });
  it.each(["PENDING", "WAITLIST"])("preserves returned %s instead of calling it confirmed", status => {
    expect(checkedRegistrationResult({ ...result, status }, "event-one", input.divisionId).status).toBe(status);
  });
});
