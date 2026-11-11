import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMyEvents, type MyEvent } from "./myEventsApi.ts";
import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

vi.mock("./apiClient.ts", async importOriginal => ({ ...await importOriginal<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", async importOriginal => ({ ...await importOriginal<typeof import("./sessionClient.ts")>(), withAccessToken: vi.fn() }));
const eventFixture = (): MyEvent => ({
  competition: { _id: "507f1f77bcf86cd799439011", name: "Autumn Open", date: "2026-11-20", location: "Toronto", gym: { _id: "507f1f77bcf86cd799439012", name: "North Wall" }, status: "PUBLISHED", registrationStatus: "CLOSED", startTime: null, startsAt: null, started: true, endTime: null, endsAt: null, ended: false },
  registration: { registrationId: "507f1f77bcf86cd799439013", status: "CONFIRMED", registeredAt: "2026-10-20T15:00:00Z", division: { _id: "507f1f77bcf86cd799439014", name: "Open" } },
});
beforeEach(() => {
  vi.mocked(withAccessToken).mockImplementation(operation => operation("my-events-token"));
  vi.mocked(apiRequest).mockResolvedValue({ events: [eventFixture()] });
});
afterEach(() => vi.clearAllMocks());
describe("US030 personal events API", () => {
  it("uses the session token and cancellation without accepting an arbitrary user identity", async () => {
    const controller = new AbortController();
    expect(await getMyEvents(controller.signal)).toEqual([eventFixture()]);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/competitions/my-events", { headers: { Authorization: "Bearer my-events-token" }, signal: controller.signal });
  });
  it("accepts a genuine empty list", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ events: [] });
    await expect(getMyEvents()).resolves.toEqual([]);
  });
  it.each(["CONFIRMED", "WAITLIST", "PENDING"])("preserves %s without upgrading the registration", async status => {
    const item = eventFixture(); item.registration.status = status as MyEvent["registration"]["status"];
    item.registration.division = null; item.competition.gym = null;
    vi.mocked(apiRequest).mockResolvedValue({ events: [item] });
    expect((await getMyEvents())[0].registration.status).toBe(status);
  });
  it.each([null, {}, { events: null }, { events: [null] }, { events: [eventFixture(), eventFixture()] }])("rejects malformed/duplicate data rather than showing a false empty state", async value => {
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(getMyEvents()).rejects.toThrow();
  });
  it("rejects impossible dates and unknown registration statuses", async () => {
    const item = eventFixture(); item.competition.date = "2026-02-30";
    vi.mocked(apiRequest).mockResolvedValue({ events: [item] }); await expect(getMyEvents()).rejects.toThrow();
    vi.mocked(apiRequest).mockResolvedValue({ events: [{ ...item, competition: { ...item.competition, date: "2026-11-20" }, registration: { ...item.registration, status: "UNKNOWN" } }] });
    await expect(getMyEvents()).rejects.toThrow();
  });
});
