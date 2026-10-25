import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverCompetitions, discoverySearch, EMPTY_DISCOVERY_FILTERS, getCompetitionMap, getDiscoveredEvent, getDiscoveryOptions } from "./discoveryApi.ts";
import * as sessionApi from "./sessionApi.ts";
import { startSession } from "./sessionClient.ts";
const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "climber", role: "CLIMBER", token: "discovery-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  await startSession("climber@example.com", "fixture-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("US025 protected discovery API", () => {
  it("loads filter options using the existing authenticated session", async () => {
    fetchMock.mockResolvedValue(Response.json({ gyms: [] }));
    await expect(getDiscoveryOptions()).resolves.toEqual({ gyms: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/competitions/filters", expect.objectContaining({ headers: { Accept: "application/json", Authorization: "Bearer discovery-token" } }));
  });
  it("sends all supported filters, fixed page size and cancellation", async () => {
    fetchMock.mockResolvedValue(Response.json({ competitions: [] }));
    const controller = new AbortController();
    await discoverCompetitions({ ...EMPTY_DISCOVERY_FILTERS, q: " Rock & Ice ", gymId: "507f1f77bcf86cd799439011", from: "2026-11-01", to: "2026-12-01", registration: "open", near: "place", lat: "43.6455", lng: "-79.3807", place: "Union Station", radiusKm: "25", sort: "random", seed: "4242" }, 2, controller.signal);
    const query = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost").searchParams;
    expect(Object.fromEntries(query)).toEqual({ q: "Rock & Ice", gymId: "507f1f77bcf86cd799439011", from: "2026-11-01", to: "2026-12-01", registration: "open", lat: "43.6455", lng: "-79.3807", radiusKm: "25", sort: "random", seed: "4242", page: "2", limit: "20" });
    controller.abort(); expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("asks for the saved location by name and sends where the Climber is only to the API", async () => {
    fetchMock.mockImplementation(async () => Response.json({}));
    await discoverCompetitions({ ...EMPTY_DISCOVERY_FILTERS, near: "saved", radiusKm: "10", sort: "closest" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/competitions?near=saved&radiusKm=10&sort=closest&page=1&limit=20");
    const fromHere = { ...EMPTY_DISCOVERY_FILTERS, near: "current", lat: "43.653", lng: "-79.383" };
    await discoverCompetitions(fromHere);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/competitions?lat=43.653&lng=-79.383&page=1&limit=20");
    expect(discoverySearch(fromHere).toString()).toBe("near=current");
  });
  it("leaves soonest first, an unused shuffle number, and the order of the map's pins out", async () => {
    fetchMock.mockImplementation(async () => Response.json({}));
    await discoverCompetitions({ ...EMPTY_DISCOVERY_FILTERS, sort: "soonest", seed: "77" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/competitions?page=1&limit=20");
    await getCompetitionMap({ ...EMPTY_DISCOVERY_FILTERS, near: "saved", sort: "random", seed: "77" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/competitions/map?near=saved");
  });
  it("omits empty filters and encodes event identifiers", async () => {
    fetchMock.mockImplementation(async () => Response.json({}));
    await discoverCompetitions(EMPTY_DISCOVERY_FILTERS);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/competitions?page=1&limit=20");
    await getCompetitionMap({ ...EMPTY_DISCOVERY_FILTERS, q: "Autumn", registration: "any" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/competitions/map?q=Autumn");
    await getDiscoveredEvent("one/two"); expect(fetchMock.mock.calls[2][0]).toBe("/api/competitions/one%2Ftwo");
  });
  it("retains field feedback and never falls back to a public endpoint", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "VALIDATION_ERROR", message: "Check filters.", fields: { radiusKm: "Save a location first." } }, { status: 400 }));
    await expect(discoverCompetitions({ ...EMPTY_DISCOVERY_FILTERS, radiusKm: "10" })).rejects.toMatchObject({ status: 400, fields: { radiusKm: "Save a location first." } });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "FORBIDDEN", message: "Climber access required." }, { status: 403 }));
    await expect(getDiscoveredEvent("selected")).rejects.toMatchObject({ status: 403 }); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("refreshes an expired token and repeats the protected read", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "climber", role: "CLIMBER", token: "fresh-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 })).mockResolvedValueOnce(Response.json({ gyms: [] }));
    await getDiscoveryOptions(); expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/competitions/filters", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }) }));
  });
});
