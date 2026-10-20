import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRegistrationStatus, readRegistrationStatus } from "./registrationStatusApi.ts";
import { startSession } from "./sessionClient.ts";
import * as sessionApi from "./sessionApi.ts";

const id = "507f1f77bcf86cd799439011";
const fetchMock = vi.fn<typeof fetch>();
const dto = {
  competition: { _id: id, name: "Selected event", date: "2026-11-14", location: "Toronto", gym: { _id: "gym", name: "Local gym" }, status: "PUBLISHED", upcoming: true, registrationStatus: "OPEN" },
  registration: { registrationId: "registration-one", status: "CONFIRMED", confirmed: true, waitlistPosition: null, division: { _id: "division-one", name: "Open" }, registeredAt: "2026-10-20T01:00:00Z" },
  capacity: { capacity: 3, confirmed: 1, spacesLeft: 2, full: false },
};
const event = { ...dto.competition, capacity: 3, spacesLeft: 3, full: false, myRegistration: null };
const absent = () => Response.json({ error: "REGISTRATION_NOT_FOUND", message: "You're not registered for this competition." }, { status: 404 });
beforeEach(async () => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "own-climber", role: "CLIMBER", token: "status-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "own-climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  await startSession("climber@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("US-029 registration status adapter -> FR-009 -> AC-013", () => {
  it("reads an encoded selected event with bearer identity and no write/body", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...dto, competition: { ...dto.competition, _id: "event/one" } }));
    await getRegistrationStatus("event/one");
    expect(fetchMock).toHaveBeenCalledWith("/api/competitions/event%2Fone/registration", expect.objectContaining({ method: "GET", credentials: "include", headers: { Accept: "application/json", Authorization: "Bearer status-token" }, body: undefined }));
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("climberId");
  });
  it.each(["CONFIRMED", "WAITLIST", "PENDING"])("preserves %s independently of a full competition", status => {
    const result = readRegistrationStatus({ ...dto, registration: { ...dto.registration, status, confirmed: status === "CONFIRMED" }, capacity: { capacity: 1, confirmed: 1, spacesLeft: 0, full: true } }, id);
    expect(result.state).toBe(status); expect(result.capacity.full).toBe(true);
  });
  it.each([
    null, {}, { ...dto.registration, registrationId: "" }, { ...dto.registration, status: "NEW_STATE" },
    { ...dto.registration, status: null }, { ...dto.registration, confirmed: false },
    { ...dto.registration, status: "WAITLIST", confirmed: true }, { ...dto.registration, status: "PENDING", confirmed: undefined },
  ])("never calls missing or contradictory registration confirmed: %s", registration => {
    expect(readRegistrationStatus({ ...dto, registration }, id).state).toBe("UNAVAILABLE");
  });
  it.each([null, -1, 1.5, "3"])("does not invent capacity values from %s", value => {
    const result = readRegistrationStatus({ ...dto, capacity: { capacity: value, spacesLeft: value, full: value } }, id);
    expect(result.capacity).toEqual({ maximum: null, spacesLeft: null, full: null }); expect(result.state).toBe("CONFIRMED");
  });
  it.each([null, 0, -1, 1.5])("does not invent a waitlist position from %s", waitlistPosition => {
    const result = readRegistrationStatus({ ...dto, registration: { ...dto.registration, status: "WAITLIST", confirmed: false, waitlistPosition } }, id);
    expect(result.state).toBe("WAITLIST"); expect(result.waitlistPosition).toBeNull();
  });
  it.each([null, { ...dto.competition, _id: "another-event" }, { ...dto.competition, name: "" }])("rejects an absent or mismatched event: %s", competition => {
    expect(() => readRegistrationStatus({ ...dto, competition }, id)).toThrow(/selected competition/);
  });
  it.each([false, true])("reads real event information only after explicit no-registration (full=%s)", async full => {
    fetchMock.mockResolvedValueOnce(absent()).mockResolvedValueOnce(Response.json({ ...event, full, spacesLeft: full ? 0 : 3 }));
    const result = await getRegistrationStatus(id);
    expect(result.state).toBe("NOT_REGISTERED"); expect(result.competition.name).toBe(event.name); expect(result.capacity.full).toBe(full);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/competitions/" + id + "/registration", "/api/competitions/" + id]);
    expect(fetchMock.mock.calls.every(call => call[1]?.method === "GET")).toBe(true);
  });
  it.each([400, 401, 403, 404, 409, 500])("does not treat a generic failure as no registration (%s)", async status => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "REQUEST_FAILED", message: "Unavailable." }, { status }));
    await expect(getRegistrationStatus(id)).rejects.toMatchObject({ status }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not reveal an event that becomes hidden after the empty response", async () => {
    fetchMock.mockResolvedValueOnce(absent()).mockResolvedValueOnce(Response.json({ error: "COMPETITION_NOT_FOUND", message: "Event unavailable." }, { status: 404 }));
    await expect(getRegistrationStatus(id)).rejects.toMatchObject({ code: "COMPETITION_NOT_FOUND" }); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("re-reads status if a registration commits between the two GETs", async () => {
    fetchMock.mockResolvedValueOnce(absent()).mockResolvedValueOnce(Response.json({ ...event, myRegistration: { status: "CONFIRMED" } })).mockResolvedValueOnce(Response.json(dto));
    expect((await getRegistrationStatus(id)).state).toBe("CONFIRMED"); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("does not loop or invent confirmation if that bounded re-read fails", async () => {
    fetchMock.mockResolvedValueOnce(absent()).mockResolvedValueOnce(Response.json({ ...event, myRegistration: { status: "CONFIRMED" } })).mockResolvedValueOnce(absent());
    await expect(getRegistrationStatus(id)).rejects.toMatchObject({ code: "REGISTRATION_NOT_FOUND" }); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("refreshes an expired session before repeating its protected read", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "own-climber", role: "CLIMBER", token: "fresh-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 })).mockResolvedValueOnce(Response.json(dto));
    expect((await getRegistrationStatus(id)).state).toBe("CONFIRMED"); expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/competitions/" + id + "/registration", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }) }));
  });
  it("forwards cancellation without falling back or claiming no registration", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => { options?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true }); }));
    const operation = getRegistrationStatus(id, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); controller.abort();
    await expect(operation).rejects.toMatchObject({ code: "ABORTED" }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps missing optional facts unavailable without discarding a known status", () => {
    const result = readRegistrationStatus({ ...dto, competition: { _id: id, name: "Selected event" }, registration: { registrationId: "saved", status: "CONFIRMED", confirmed: true } }, id);
    expect(result.state).toBe("CONFIRMED"); expect(result.divisionName).toBeNull(); expect(result.registeredAt).toBeNull(); expect(result.competition.location).toBeNull();
  });
  it("matches MongoDB object IDs without depending on letter casing", () => {
    expect(readRegistrationStatus(dto, id.toUpperCase()).state).toBe("CONFIRMED");
  });
});
