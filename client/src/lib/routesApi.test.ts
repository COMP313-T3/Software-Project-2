import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCompetitionRoute, getCompetitionRoute, updateCompetitionRoute, type CreateRouteInput, type UpdateRouteInput } from "./routesApi.ts";
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

describe("US-017 protected route details and updates", () => {
  it("loads the selected route using both encoded IDs and the current bearer token", async () => {
    const route = { ...created, ...input, pointValue: 0, notes: "Overhang" };
    fetchMock.mockResolvedValue(Response.json(route));
    await expect(getCompetitionRoute("event/one", "route/two")).resolves.toEqual(route);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/routes/route%2Ftwo", expect.objectContaining({
      method: "GET", credentials: "include", headers: { Accept: "application/json", Authorization: "Bearer test-gym-token" },
    }));
  });
  it("patches only the three edit fields, preserving zero and an explicit notes clear", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...created, ...input, pointValue: 0 }));
    await updateCompetitionRoute("event/one", "route/two", {
      grade: "V6", pointValue: 0, notes: "", official: false, competitionId: "forged", routeId: "forged", routeNumber: "B9", name: "Forged",
    } as UpdateRouteInput);
    expect(fetchMock).toHaveBeenCalledWith("/api/gym-admin/competitions/event%2Fone/routes/route%2Ftwo", expect.objectContaining({
      method: "PATCH", headers: expect.objectContaining({ Authorization: "Bearer test-gym-token" }),
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ grade: "V6", pointValue: 0, notes: "" });
  });
  it("omits unchanged points and notes when only the official grade changes", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...created, ...input, grade: "V5" }));
    await updateCompetitionRoute("event-one", "route-one", { grade: "V5" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ grade: "V5" });
  });
  it("returns route field validation without losing the API's field names", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "VALIDATION_ERROR", message: "Check route details.", fields: { grade: "Enter a V-grade." } }, { status: 400 }));
    await expect(updateCompetitionRoute("event-one", "route-one", { grade: "V-1" }))
      .rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", fields: { grade: "Enter a V-grade." } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([403, 404, 409, 503])("does not automatically retry a rejected route edit (%s)", async status => {
    fetchMock.mockResolvedValue(Response.json({ error: "ROUTE_UNAVAILABLE", message: "Unavailable." }, { status }));
    await expect(updateCompetitionRoute("event-one", "route-one", { notes: "Changed" })).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(sessionApi.refreshSession).not.toHaveBeenCalled();
  });
  it("does not retry an unconfirmed PATCH after a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(updateCompetitionRoute("event-one", "route-one", { grade: "V5" })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes an expired token before resending the rejected edit", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "renewed-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ...created, ...input, grade: "V5" }));
    await updateCompetitionRoute("event-one", "route-one", { grade: "V5" });
    expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/gym-admin/competitions/event-one/routes/route-one", expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ Authorization: "Bearer renewed-token" }) }));
  });
  it.each(["GET", "PATCH"])("forwards cancellation for route %s", async method => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    const response = method === "GET" ? getCompetitionRoute("event", "route", controller.signal)
      : updateCompetitionRoute("event", "route", { grade: "V5" }, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); controller.abort();
    await expect(response).rejects.toMatchObject({ code: "ABORTED" });
  });
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
