import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getRegistrationStatus, type RegistrationStatusData } from "../lib/registrationStatusApi.ts";
import { getDiscoveredEvent, type DiscoveredEventDetails } from "../lib/discoveryApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/registrationStatusApi.ts", async original => ({ ...await original<typeof import("../lib/registrationStatusApi.ts")>(), getRegistrationStatus: vi.fn() }));
vi.mock("../lib/discoveryApi.ts", async original => ({ ...await original<typeof import("../lib/discoveryApi.ts")>(), getDiscoveredEvent: vi.fn() }));
const id = "507f1f77bcf86cd799439011", otherId = "507f1f77bcf86cd799439019";
const data: RegistrationStatusData = {
  competition: { _id: id, name: "Selected competition", date: "2026-11-14", location: "Toronto", gymName: "Local gym", status: "PUBLISHED", upcoming: true, registrationStatus: "OPEN" },
  state: "CONFIRMED", divisionName: "Open division", registeredAt: "2026-10-20T01:00:00Z", waitlistPosition: null, capacity: { maximum: 3, spacesLeft: 2, full: false },
};
function Navigation() {
  const navigate = useNavigate(), location = useLocation();
  return <><button onClick={() => navigate("/competitions/" + otherId + "/registration")}>Select another event</button><output aria-label="Current address">{location.pathname + location.search}</output></>;
}
function renderPage(url = "/competitions/" + id + "/registration") { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const registration = () => within(screen.getByRole("region", { name: "Your registration" }));
const capacity = () => within(screen.getByRole("region", { name: "Competition capacity" }));
beforeEach(() => {
  vi.mocked(getRegistrationStatus).mockReset().mockResolvedValue(structuredClone(data)); vi.mocked(getDiscoveredEvent).mockReset();
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "own-climber", role: "CLIMBER", token: "test-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "own-climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-029 protected registration status page -> FR-009 -> AC-013", () => {
  it.each([
    ["CONFIRMED", "Confirmed"], ["WAITLIST", "Waitlist"], ["PENDING", "Pending"], ["NOT_REGISTERED", "Not registered"], ["UNAVAILABLE", "Status unavailable"],
  ] as const)("displays the API's %s state with a clear text label", async (state, label) => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, state }); renderPage();
    expect(await screen.findByRole("heading", { name: label })).toBeTruthy();
    expect(screen.getByRole("heading", { name: data.competition.name })).toBeTruthy();
    expect(getRegistrationStatus).toHaveBeenCalledWith(id, expect.any(AbortSignal));
    if (state === "NOT_REGISTERED") {
      expect(registration().getByText("No registration was found for your account in this competition.")).toBeTruthy();
      expect(registration().queryByText("Division", { selector: "dt" })).toBeNull();
    }
  });
  it("keeps Confirmed visible when the competition is Full", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, capacity: { maximum: 1, spacesLeft: 0, full: true } }); renderPage();
    await screen.findByRole("heading", { name: "Confirmed" }); expect(capacity().getByText("Full", { exact: true })).toBeTruthy(); expect(capacity().getByText("0")).toBeTruthy();
  });
  it("shows Waitlist position and Full independently", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, state: "WAITLIST", waitlistPosition: 2, capacity: { maximum: 1, spacesLeft: 0, full: true } }); renderPage();
    await screen.findByRole("heading", { name: "Waitlist" }); expect(registration().getByText("Waitlist position").nextElementSibling?.textContent).toBe("2"); expect(capacity().getByText("Full", { exact: true })).toBeTruthy();
  });
  it("does not invent a waitlist position when it is missing", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, state: "WAITLIST" }); renderPage();
    await screen.findByRole("heading", { name: "Waitlist" }); expect(registration().getByText("Waitlist position").nextElementSibling?.textContent).toBe("Unavailable");
  });
  it("uses readable missing-data labels instead of invented facts or zero capacity", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, competition: { ...data.competition, gymName: null, location: null, date: "" }, divisionName: null, registeredAt: null, capacity: { maximum: null, spacesLeft: null, full: null } }); renderPage();
    await screen.findByRole("heading", { name: "Confirmed" }); expect(screen.getByText("Date unavailable")).toBeTruthy(); expect(screen.getByText("Location unavailable")).toBeTruthy();
    expect(registration().getByText("Division unavailable")).toBeTruthy(); expect(capacity().getByText("Availability unavailable")).toBeTruthy(); expect(capacity().getAllByText("Unavailable")).toHaveLength(2);
  });
  it("shows a cancellation while retaining the saved personal registration", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, competition: { ...data.competition, status: "CANCELLED", registrationStatus: "CLOSED" } }); renderPage();
    await screen.findByRole("heading", { name: "Confirmed" }); expect(screen.getByText(/has been cancelled/)).toBeTruthy(); expect(screen.queryByRole("link", { name: "View event details" })).toBeNull();
  });
  it("shows a draft notice without offering a discovery details link", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, competition: { ...data.competition, status: "DRAFT" } }); renderPage();
    await screen.findByRole("heading", { name: "Confirmed" }); expect(screen.getByText(/currently a draft/)).toBeTruthy(); expect(screen.queryByRole("link", { name: "View event details" })).toBeNull();
  });
  it("shows past/closed event notices without changing the registration", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValueOnce({ ...data, competition: { ...data.competition, upcoming: false, registrationStatus: "CLOSED" } }); renderPage();
    await screen.findByRole("heading", { name: "Confirmed" }); expect(screen.getByText(/already taken place/)).toBeTruthy(); expect(screen.getByText("Registration is closed for this competition.")).toBeTruthy();
  });
  it("shows loading and disables refresh while its first read is processing", async () => {
    const pending = deferred<RegistrationStatusData>(); vi.mocked(getRegistrationStatus).mockReturnValueOnce(pending.promise); renderPage();
    await screen.findByText("Loading your registration status…"); expect(screen.getByRole("button", { name: "Refresh status" }).matches(":disabled")).toBe(true); expect(screen.queryByRole("region", { name: "Your registration" })).toBeNull();
    await act(async () => pending.resolve(data)); await screen.findByRole("heading", { name: "Confirmed" });
  });
  it("hides stale data during refresh, updates the returned status, and announces it", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Confirmed" });
    const pending = deferred<RegistrationStatusData>(); vi.mocked(getRegistrationStatus).mockReturnValueOnce(pending.promise); fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(screen.queryByRole("heading", { name: "Confirmed" })).toBeNull(); expect(screen.getByText("Loading your registration status…")).toBeTruthy();
    await act(async () => pending.resolve({ ...data, state: "WAITLIST", waitlistPosition: 1 }));
    await screen.findByRole("heading", { name: "Waitlist" }); expect(within(screen.getByRole("main")).getByRole("status").textContent).toContain("Registration status updated: Waitlist");
  });
  it("hides private error details behind readable feedback", async () => {
    vi.mocked(getRegistrationStatus).mockRejectedValueOnce(new Error("private database credentials")); renderPage();
    expect(await screen.findByText("Couldn't load your registration status. Please try again.")).toBeTruthy(); expect(screen.queryByText(/private database/)).toBeNull(); expect(screen.queryByRole("heading", { name: "Not registered" })).toBeNull();
  });
  it.each([400, 401, 403, 404, 500, 0])("does not treat an error as an absent or confirmed registration (%s)", async status => {
    vi.mocked(getRegistrationStatus).mockRejectedValueOnce(new ApiError(status, "REQUEST_FAILED", "Readable request error.")); renderPage();
    await screen.findByRole("alert"); expect(screen.queryByRole("region", { name: "Your registration" })).toBeNull();
    if (status === 401) expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    if (status >= 500 || status === 0) expect(screen.queryByText("Readable request error.")).toBeNull();
  });
  it("retries a failed read and displays the fresh API reply", async () => {
    vi.mocked(getRegistrationStatus).mockRejectedValueOnce(new Error("offline")); renderPage(); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByRole("heading", { name: "Confirmed" }); expect(getRegistrationStatus).toHaveBeenCalledTimes(2);
  });
  it("removes previously visible private information after a denied refresh", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Confirmed" });
    vi.mocked(getRegistrationStatus).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Access denied.")); fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await screen.findByRole("alert"); expect(screen.queryByText(data.competition.name)).toBeNull(); expect(screen.queryByRole("region", { name: "Your registration" })).toBeNull();
  });
  it.each(["ADMIN", "GYM_ADMIN"] as const)("blocks %s before private status reads", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } }); renderPage();
    await screen.findByRole("heading", { name: "Climber access required" }); expect(getRegistrationStatus).not.toHaveBeenCalled();
  });
  it("sends a Visitor to login before private status reads", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: false }); renderPage();
    await screen.findByRole("heading", { name: "Welcome back" }); expect(getRegistrationStatus).not.toHaveBeenCalled();
  });
  it("links from event details and preserves discovery filters in both back links", async () => {
    const event: DiscoveredEventDetails = { _id: id, name: data.competition.name, date: "2026-11-14", location: "Toronto", gym: { _id: "gym", name: "Local gym" }, capacity: 3, spacesLeft: 3, full: false, coordinates: null, registrationStatus: "OPEN", description: "Description", upcoming: true, registrationAvailable: true, myRegistration: null, scoringFormat: null, divisions: [] };
    vi.mocked(getDiscoveredEvent).mockResolvedValueOnce(event); const search = "?q=Autumn&view=list&page=2"; renderPage("/competitions/" + id + search);
    await screen.findByRole("region", { name: "Competition event details" }); fireEvent.click(screen.getByRole("link", { name: "View registration status" }));
    await screen.findByRole("heading", { name: "Confirmed" });
    expect(screen.getByRole("link", { name: "Back to discovery" }).getAttribute("href")).toBe("/competitions" + search);
    expect(screen.getByRole("link", { name: "View event details" }).getAttribute("href")).toBe("/competitions/" + id + search);
  });
  it("never passes a forged query identity to the status API", async () => {
    renderPage("/competitions/" + id + "/registration?climberId=another-account"); await screen.findByRole("heading", { name: "Confirmed" });
    expect(getRegistrationStatus).toHaveBeenCalledWith(id, expect.any(AbortSignal)); expect(vi.mocked(getRegistrationStatus).mock.calls[0]).toHaveLength(2);
  });
  it("aborts stale reads when switching events and ignores their late replies", async () => {
    const pending = deferred<RegistrationStatusData>(); vi.mocked(getRegistrationStatus).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...data, competition: { ...data.competition, _id: otherId, name: "Another selected event" } });
    renderPage(); await screen.findByText("Loading your registration status…"); const signal = vi.mocked(getRegistrationStatus).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Select another event" })); await screen.findByRole("heading", { name: "Another selected event" });
    await act(async () => pending.resolve(data)); expect(signal?.aborted).toBe(true); expect(screen.queryByText(data.competition.name)).toBeNull();
  });
});
