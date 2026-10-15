import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCompetitionRoute, type CreateRouteInput } from "./routesApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";

const fetchMock = vi.fn<typeof fetch>();
const input: CreateRouteInput = { routeNumber: "A8", name: "Summit Traverse", grade: "V4" };
const created = { routeId: "route-one", competitionId: "event-one", grade: "V4", official: true };
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "test-gym-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  await startSession("gym@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("US-016 protected route creation API", () => {
  it("posts to the selected event with the shared bearer session and encoded ID", async () => {
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    await expect(createCompetitionRoute("event/one", input)).resolves.toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/routes", expect.objectContaining({
      method: "POST", credentials: "include", body: JSON.stringify(input),
      headers: { Accept: "application/json", Authorization: "Bearer test-gym-token", "Content-Type": "application/json" },
    }));
  });
  it("does not accept forged ownership, route identity or an unofficial grade flag", async () => {
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    await createCompetitionRoute("event-one", { ...input, gymId: "foreign-gym", competitionId: "foreign-event", routeId: "forged", official: false } as CreateRouteInput);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input);
  });
  it.each([0, 25, 2.5, -1])("preserves numeric point value %s without inventing scoring limits", async pointValue => {
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    await createCompetitionRoute("event-one", { ...input, pointValue, notes: "  Overhang  " });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ ...input, pointValue, notes: "Overhang" });
  });
  it("omits unused points and whitespace-only notes", async () => {
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    await createCompetitionRoute("event-one", { ...input, notes: "   " });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input);
  });
  it("propagates field errors and does not retry a duplicate write", async () => {
    const message = "This competition already has a route with this number.";
    fetchMock.mockResolvedValue(Response.json({ error: "ROUTE_EXISTS", message, fields: { routeNumber: message } }, { status: 409 }));
    await expect(createCompetitionRoute("event-one", input)).rejects.toMatchObject({ status: 409, code: "ROUTE_EXISTS", fields: { routeNumber: message } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([403, 404, 503])("does not automatically repeat a failed POST (%s)", async status => {
    fetchMock.mockResolvedValue(Response.json({ error: "REQUEST_FAILED", message: "Unavailable." }, { status }));
    await expect(createCompetitionRoute("event-one", input)).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
  it("does not retry when the network cannot confirm a write", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(createCompetitionRoute("event-one", input)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes an explicitly expired token before resending the rejected request", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "renewed-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 }))
      .mockResolvedValueOnce(Response.json(created, { status: 201 }));
    await createCompetitionRoute("event-one", input);
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/competitions/event-one/routes", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer renewed-token" }) }));
  });
  it("forwards cancellation to the active request", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    const response = createCompetitionRoute("event-one", input, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await expect(response).rejects.toMatchObject({ code: "ABORTED" });
  });
});
