import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getDiscoveredEvent, type DiscoveredEventDetails } from "../lib/discoveryApi.ts";
import { registerForEvent } from "../lib/eventRegistrationApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/discoveryApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/discoveryApi.ts")>(), getDiscoveredEvent: vi.fn() }));
vi.mock("../lib/eventRegistrationApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/eventRegistrationApi.ts")>(), registerForEvent: vi.fn() }));
const event: DiscoveredEventDetails = {
  _id: "507f1f77bcf86cd799439011", name: "Brian's Event", description: "A local bouldering competition.", date: "2026-11-14", location: "Toronto",
  gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" }, capacity: 80, spacesLeft: 16, full: false,
  coordinates: null, registrationStatus: "OPEN", upcoming: true, registrationAvailable: true, myRegistration: null,
  scoringFormat: null, divisions: [{ _id: "division-one", name: "Open division" }],
};
const otherId = "507f1f77bcf86cd799439019";
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate("/competitions/" + otherId)}>Select another event</button>; }
function renderPage(url = "/competitions/" + event._id) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.mocked(getDiscoveredEvent).mockReset().mockResolvedValue({ ...event }); vi.mocked(registerForEvent).mockReset();
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "climber-one", role: "CLIMBER", token: "test-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber-one", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-028 live event page integrated with #109/#110", () => {
  it("uses the existing protected GET and preserves discovery filters", async () => {
    const search = "?q=Autumn&registration=open&page=2&view=map";
    renderPage("/competitions/" + event._id + search);
    expect(await screen.findByRole("region", { name: "Competition event details" })).toBeTruthy();
    expect(getDiscoveredEvent).toHaveBeenCalledWith(event._id, expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "Back to discovery" }).getAttribute("href")).toBe("/competitions" + search);
    expect(screen.getByText("To be announced")).toBeTruthy();
    const input = screen.getByRole("radio", { name: "Open division" }); expect(input.matches(":disabled")).toBe(false);
    fireEvent.submit(screen.getByRole("form", { name: "Competition registration" })); expect(registerForEvent).not.toHaveBeenCalled();
    expect(screen.getByText("Choose an eligible division to continue.")).toBeTruthy();
  });
  it("shows loading before event information is returned", async () => {
    const pending = deferred<DiscoveredEventDetails>(); vi.mocked(getDiscoveredEvent).mockReturnValueOnce(pending.promise); renderPage();
    expect(await screen.findByText("Loading event details…")).toBeTruthy(); expect(screen.queryByRole("form")).toBeNull();
    await act(async () => pending.resolve(event)); expect(await screen.findByRole("region", { name: "Competition event details" })).toBeTruthy();
  });
  it.each(["ADMIN", "GYM_ADMIN"] as const)("blocks %s before private event reads", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); expect(await screen.findByRole("heading", { name: "Climber access required" })).toBeTruthy(); expect(getDiscoveredEvent).not.toHaveBeenCalled(); expect(registerForEvent).not.toHaveBeenCalled();
  });
  it("sends a Visitor to login before private event reads", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: false }); renderPage();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy(); expect(getDiscoveredEvent).not.toHaveBeenCalled();
  });
  it.each([403, 404])("hides event data when its GET is rejected (%s)", async status => {
    vi.mocked(getDiscoveredEvent).mockRejectedValueOnce(new ApiError(status, "COMPETITION_NOT_FOUND", "Event unavailable.")); renderPage();
    expect(await screen.findByText("Event unavailable.")).toBeTruthy(); expect(screen.queryByText(event.name)).toBeNull(); expect(screen.queryByRole("form")).toBeNull();
  });
  it("shows readable retry feedback without exposing internal errors", async () => {
    vi.mocked(getDiscoveredEvent).mockRejectedValueOnce(new Error("private database")); renderPage();
    expect(await screen.findByText("Couldn't load this event. Please try again.")).toBeTruthy(); expect(screen.queryByText("private database")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(await screen.findByRole("region", { name: "Competition event details" })).toBeTruthy();
  });
  it("refreshes the saved event's actual capacity and registration state", async () => {
    renderPage(); await screen.findByRole("region", { name: "Competition event details" });
    vi.mocked(getDiscoveredEvent).mockResolvedValueOnce({ ...event, spacesLeft: 0, full: true }); fireEvent.click(screen.getByRole("button", { name: "Refresh event details" }));
    expect(await screen.findByText("This competition is full.")).toBeTruthy(); expect(getDiscoveredEvent).toHaveBeenCalledTimes(2); expect(registerForEvent).not.toHaveBeenCalled();
  });
  it("submits once for the signed-in Climber and reloads the saved status and count", async () => {
    const pending = deferred<Awaited<ReturnType<typeof registerForEvent>>>(); vi.mocked(registerForEvent).mockReturnValueOnce(pending.promise);
    renderPage(); await screen.findByRole("region", { name: "Competition event details" });
    fireEvent.click(screen.getByRole("radio", { name: "Open division" }));
    const form = screen.getByRole("form", { name: "Competition registration" }); fireEvent.submit(form); fireEvent.submit(form);
    expect(registerForEvent).toHaveBeenCalledOnce(); expect(registerForEvent).toHaveBeenCalledWith(event._id, { climberId: "climber-one", divisionId: event.divisions[0]._id }, expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Refresh event details" }).matches(":disabled")).toBe(true);
    await act(async () => pending.resolve({ registrationId: "saved-registration", competitionId: event._id, divisionId: event.divisions[0]._id, status: "CONFIRMED" }));
    expect(await screen.findByRole("heading", { name: "Registration confirmed" })).toBeTruthy();
    vi.mocked(getDiscoveredEvent).mockResolvedValueOnce({ ...event, spacesLeft: 15, registrationAvailable: false, myRegistration: { status: "CONFIRMED", registeredAt: "2026-10-19T03:00:00Z", division: event.divisions[0] } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh event details" })); expect(await screen.findByRole("heading", { name: "Confirmed" })).toBeTruthy();
    expect(screen.getByText("Spaces left", { selector: "dt" }).nextElementSibling?.textContent).toBe("15"); expect(screen.queryByRole("form")).toBeNull(); expect(registerForEvent).toHaveBeenCalledOnce();
  });
  it("requires a refresh after stale capacity is rejected and then displays the actual full state", async () => {
    vi.mocked(registerForEvent).mockRejectedValueOnce(new ApiError(409, "COMPETITION_FULL", "This competition is full. No spaces are available."));
    renderPage(); await screen.findByRole("region", { name: "Competition event details" }); fireEvent.click(screen.getByRole("radio", { name: "Open division" }));
    fireEvent.submit(screen.getByRole("form", { name: "Competition registration" })); expect(await screen.findByText("This competition is full. No spaces are available.")).toBeTruthy();
    fireEvent.submit(screen.getByRole("form", { name: "Competition registration" })); expect(registerForEvent).toHaveBeenCalledOnce();
    vi.mocked(getDiscoveredEvent).mockResolvedValueOnce({ ...event, spacesLeft: 0, full: true, registrationAvailable: false }); fireEvent.click(screen.getByRole("button", { name: "Refresh event details" }));
    expect(await screen.findByText("This competition is full.")).toBeTruthy(); expect(screen.getByText("Spaces left", { selector: "dt" }).nextElementSibling?.textContent).toBe("0");
  });
  it("hides event information when the registration API reports that the event is no longer visible", async () => {
    vi.mocked(registerForEvent).mockRejectedValueOnce(new ApiError(404, "COMPETITION_NOT_FOUND", "Event unavailable."));
    renderPage(); await screen.findByRole("region", { name: "Competition event details" }); fireEvent.click(screen.getByRole("radio", { name: "Open division" }));
    fireEvent.submit(screen.getByRole("form", { name: "Competition registration" })); expect(await screen.findByText("Event unavailable.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Competition event details" })).toBeNull(); expect(screen.queryByText(event.name)).toBeNull();
  });
  it("aborts stale reads when the selected event changes", async () => {
    const pending = deferred<DiscoveredEventDetails>(); vi.mocked(getDiscoveredEvent).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...event, _id: otherId, name: "Second event" });
    renderPage(); await screen.findByText("Loading event details…"); const signal = vi.mocked(getDiscoveredEvent).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Select another event" })); await screen.findByRole("heading", { name: "Second event", level: 1 });
    await act(async () => pending.resolve(event)); expect(signal?.aborted).toBe(true); expect(screen.queryByText(event.name)).toBeNull(); expect(registerForEvent).not.toHaveBeenCalled();
  });
});
