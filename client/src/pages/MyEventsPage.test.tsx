import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyEventsPage from "./MyEventsPage.tsx";
import { getMyEvents, type MyEvent } from "../lib/myEventsApi.ts";
import { ApiError } from "../lib/apiClient.ts";
let role = "CLIMBER", userId = "climber-one";
vi.mock("../components/session/sessionContext.ts", () => ({ useSession: () => ({ user: { userId, role, email: "demo@example.com" }, logOut: vi.fn() }) }));
vi.mock("../lib/myEventsApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/myEventsApi.ts")>(), getMyEvents: vi.fn() }));
const opened = vi.fn();
vi.mock("./LeaderboardPage.tsx", () => ({ default: (props: { returnTo: string }) => { opened(props); return <Link to={props.returnTo}>Back to my event</Link>; } }));
vi.mock("./RegistrationStatusPage.tsx", () => ({ default: (props: { returnTo: string }) => <Link to={props.returnTo}>Back to my event</Link> }));
const scorecardOpened = vi.fn();
vi.mock("./ScorecardPage.tsx", () => ({ default: (props: { returnTo: string }) => { scorecardOpened(props); return <Link to={props.returnTo}>Back to my event</Link>; } }));
const id = "507f1f77bcf86cd799439011";
function eventFixture(index = 0): MyEvent {
  return { competition: { _id: index ? index.toString(16).padStart(24, "0") : id, name: index ? `Event ${index}` : "Autumn Open", date: "2026-11-20", location: "Toronto", gym: { _id: "507f1f77bcf86cd799439012", name: "North Wall" }, status: "PUBLISHED", registrationStatus: "CLOSED", startTime: null, startsAt: null, started: true }, registration: { registrationId: "507f1f77bcf86cd799439013", status: "CONFIRMED", registeredAt: "2026-10-20T15:00:00Z", division: { _id: "507f1f77bcf86cd799439014", name: "Open" } } };
}
function renderPage(path = "/my-events") {
  return render(<MemoryRouter initialEntries={[path]}><Link to={`/my-events/${id}/leaderboard`}>Direct tool</Link><Routes>
    <Route path="/my-events" element={<MyEventsPage />} />
    <Route path="/my-events/:competitionId" element={<MyEventsPage />} />
    <Route path="/my-events/:competitionId/leaderboard" element={<MyEventsPage tool="leaderboard" />} />
    <Route path="/my-events/:competitionId/registration" element={<MyEventsPage tool="registration" />} />
    <Route path="/my-events/:competitionId/scorecard" element={<MyEventsPage tool="scorecard" />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { role = "CLIMBER"; userId = "climber-one"; opened.mockClear(); scorecardOpened.mockClear(); vi.mocked(getMyEvents).mockReset().mockResolvedValue([eventFixture()]); });
afterEach(() => cleanup());
describe("US030 #201/#202 My Events and tool navigation", () => {
  it("shows registered event information, actual status and a correctly scoped entry point", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    expect(screen.getByText("Nov 20, 2026", { exact: false })).toBeTruthy();
    expect(screen.getByText("North Wall · Open")).toBeTruthy(); expect(screen.getByText("Confirmed")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Open Autumn Open" }));
    await screen.findByRole("heading", { name: "Event tools" });
    expect(screen.getByRole("link", { name: "Live leaderboard" }).getAttribute("href")).toBe(`/my-events/${id}/leaderboard`);
    expect(screen.getByRole("link", { name: "Registration status" }).getAttribute("href")).toBe(`/my-events/${id}/registration`);
  });
  it("US-031 opens the Climber's scorecard for the selected event and returns to its workspace", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    expect(screen.getByRole("link", { name: "My scorecard" }).getAttribute("href")).toBe(`/my-events/${id}/scorecard`);
    fireEvent.click(screen.getByRole("link", { name: "My scorecard" }));
    const back = await screen.findByRole("link", { name: "Back to my event" });
    expect(scorecardOpened).toHaveBeenCalledWith({ returnTo: `/my-events/${id}` });
    fireEvent.click(back); await screen.findByRole("heading", { name: "Event tools" });
  });
  it("US-031 offers the scorecard of a cancelled event, whose official results stay visible", async () => {
    const event = eventFixture(); event.competition.status = "CANCELLED";
    vi.mocked(getMyEvents).mockResolvedValue([event]); renderPage(`/my-events/${id}/scorecard`);
    await screen.findByRole("link", { name: "Back to my event" }); expect(scorecardOpened).toHaveBeenCalled();
  });
  it("US-031 doesn't offer or open a scorecard for a draft", async () => {
    const event = eventFixture(); event.competition.status = "DRAFT";
    vi.mocked(getMyEvents).mockResolvedValue([event]); renderPage(`/my-events/${id}/scorecard`);
    await screen.findByRole("heading", { name: "Event tools" }); expect(scorecardOpened).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "My scorecard" })).toBeNull();
    expect(screen.getByText("The leaderboard and your scorecard are unavailable while this event is a draft.")).toBeTruthy();
    expect(screen.queryByText(/choose Ask AI/)).toBeNull();
  });
  it("AC-022 has no page for the AI Route Assistant, and says where its chatbot is", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    expect(screen.queryByRole("link", { name: "AI Route Assistant" })).toBeNull();
    expect(screen.queryByRole("button", { name: "AI Route Assistant" })).toBeNull();
    expect(screen.getByText("For advice from the AI Route Assistant, open your scorecard or the live leaderboard and choose Ask AI.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Event tools" })).getAllByRole("link").map(link => link.textContent)).toEqual(["Registration status", "My scorecard", "Live leaderboard"]);
  });
  it("opens the existing leaderboard for the selected event and returns to its workspace", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    fireEvent.click(screen.getByRole("link", { name: "Live leaderboard" }));
    fireEvent.click(await screen.findByRole("link", { name: "Back to my event" }));
    await screen.findByRole("heading", { name: "Autumn Open" }); expect(opened).toHaveBeenCalled();
  });
  it("keeps an empty registration list distinct from an error", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([]); renderPage();
    await screen.findByRole("heading", { name: "No registered events yet" });
    expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getAllByRole("link", { name: "Discover competitions" }).some(link => link.getAttribute("href") === "/competitions")).toBe(true);
  });
  it.each(["ADMIN", "GYM_ADMIN", "VISITOR"])("does not request private events for %s", async value => {
    role = value; renderPage(); expect(screen.getByRole("heading", { name: "Climber access required" })).toBeTruthy(); expect(getMyEvents).not.toHaveBeenCalled();
  });
  it.each(["leaderboard", "registration"])("denies a manually entered unrelated %s tool without mounting it", async tool => {
    vi.mocked(getMyEvents).mockResolvedValue([]); renderPage(`/my-events/${id}/${tool}`);
    await screen.findByRole("heading", { name: "Event unavailable" }); expect(opened).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Live leaderboard" })).toBeNull();
  });
  it("clears old tool links on refresh and handles lost access safely", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "private trace"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh events" }));
    expect(screen.queryByRole("link", { name: "Live leaderboard" })).toBeNull();
    await screen.findByRole("alert"); expect(screen.queryByText(/private trace/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Autumn Open" })).toBeNull();
  });
  it("allows retry after a read failure and offers sign-in for expiry", async () => {
    vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(401, "EXPIRED", "private")); renderPage();
    await screen.findByRole("alert"); expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    fireEvent.click(screen.getByRole("button", { name: "Refresh events" })); await screen.findByRole("heading", { name: "Autumn Open" });
  });
  it("aborts requests and ignores late responses when navigating away", async () => {
    let resolve!: (events: MyEvent[]) => void;
    vi.mocked(getMyEvents).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce([]);
    renderPage(); await waitFor(() => expect(getMyEvents).toHaveBeenCalledOnce());
    const signal = vi.mocked(getMyEvents).mock.calls[0][0];
    fireEvent.click(screen.getByRole("link", { name: "Direct tool" })); await screen.findByRole("heading", { name: "Event unavailable" });
    await act(async () => resolve([eventFixture()])); expect(signal?.aborted).toBe(true); expect(opened).not.toHaveBeenCalled();
  });
  it("paginates long lists and keeps the list page when returning from an event", async () => {
    vi.mocked(getMyEvents).mockResolvedValue(Array.from({ length: 11 }, (_, i) => eventFixture(i + 1))); renderPage();
    await screen.findByRole("heading", { name: "Event 1" }); fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("heading", { name: "Event 1" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Open Event 11" })); await screen.findByRole("heading", { name: "Event tools" });
    expect(screen.getByRole("link", { name: "Back to My Events" }).getAttribute("href")).toBe("/my-events?page=2");
  });
  it("labels waitlisted places honestly and handles removed gym/division metadata", async () => {
    const event = eventFixture(); event.registration.status = "WAITLIST"; event.registration.division = null; event.competition.gym = null;
    vi.mocked(getMyEvents).mockResolvedValue([event]); renderPage(`/my-events/${id}`);
    await screen.findByText("Waitlist"); expect(screen.getByText(/Your place is not confirmed/)).toBeTruthy();
    expect(screen.getByText("Gym unavailable")).toBeTruthy(); expect(screen.getByText("Division unavailable")).toBeTruthy();
  });
  it("does not offer a broken leaderboard for a draft", async () => {
    const event = eventFixture(); event.competition.status = "DRAFT";
    vi.mocked(getMyEvents).mockResolvedValue([event]); renderPage(`/my-events/${id}/leaderboard`);
    await screen.findByRole("heading", { name: "Event tools" }); expect(opened).not.toHaveBeenCalled(); expect(screen.queryByRole("link", { name: "Live leaderboard" })).toBeNull();
  });
  it("marks My Events as current in role navigation", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "My Events" }).getAttribute("aria-current")).toBe("true");
  });
  it("keeps the return page while the selected event is loading or its read fails", async () => {
    vi.mocked(getMyEvents).mockReturnValueOnce(new Promise(() => {}));
    renderPage(`/my-events/${id}?page=2`);
    expect(screen.getByRole("link", { name: "Back to My Events" }).getAttribute("href")).toBe("/my-events?page=2");
    cleanup(); vi.mocked(getMyEvents).mockRejectedValueOnce(new Error("offline"));
    renderPage(`/my-events/${id}?page=2`); await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Back to My Events" }).getAttribute("href")).toBe("/my-events?page=2");
  });
  it("explains cancelled events even when their saved registration is confirmed", async () => {
    const item = eventFixture(); item.competition.status = "CANCELLED";
    vi.mocked(getMyEvents).mockResolvedValue([item]); renderPage(`/my-events/${id}`);
    await screen.findByText(/This competition has been cancelled/);
    expect(screen.getByText("Confirmed")).toBeTruthy();
  });
  it("removes the previous account's events immediately when the signed-in identity changes", async () => {
    const { rerender } = render(<MemoryRouter><MyEventsPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Autumn Open" });
    const oldSignal = vi.mocked(getMyEvents).mock.calls[0][0];
    let resolve!: (events: MyEvent[]) => void;
    vi.mocked(getMyEvents).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    userId = "climber-two";
    rerender(<MemoryRouter><MyEventsPage /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Autumn Open" })).toBeNull();
    expect(screen.getByText("Loading your events…")).toBeTruthy(); expect(oldSignal?.aborted).toBe(true);
    await act(async () => resolve([])); await screen.findByRole("heading", { name: "No registered events yet" });
  });
});

describe("AC-021 the countdown to the start, and what opens then", () => {
  const STARTS_AT = "2026-11-20T15:00:00.000Z";
  function waitingEvent(overrides: Partial<MyEvent["competition"]> = {}) {
    const event = eventFixture();
    event.competition = { ...event.competition, startTime: "10:00", startsAt: STARTS_AT, started: false, ...overrides };
    return event;
  }
  function startedEvent() { return waitingEvent({ started: true }); }
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date("2026-11-20T14:59:58.000Z")); });
  afterEach(() => { vi.useRealTimers(); });
  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

  it("shows the start time with each event in the list and in the event's details", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([startedEvent()]);
    renderPage(); await settle();
    expect(screen.getByText("Nov 20, 2026").parentElement?.textContent).toBe("Nov 20, 2026, 10:00 a.m. · Toronto");
    cleanup(); renderPage(`/my-events/${id}`); await settle();
    expect(screen.getByText("Start time").nextElementSibling?.textContent).toBe("10:00 a.m. (Toronto time)");
  });
  it("leaves the start time out for an event saved without one", async () => {
    renderPage(`/my-events/${id}`); await settle();
    expect(screen.queryByText("Start time")).toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();
  });
  it("shows a countdown before the start, with only the registration status to open", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([waitingEvent()]);
    renderPage(`/my-events/${id}`); await settle();
    const countdown = screen.getByRole("region", { name: "Countdown to the start" });
    expect(within(countdown).getByText(/^Starts/).textContent).toBe("Starts Nov 20, 2026 at 10:00 a.m. (Toronto time)");
    expect(within(countdown).getByRole("timer").textContent).toContain("2 seconds left");
    expect(screen.getByRole("link", { name: "Registration status" }).getAttribute("href")).toBe(`/my-events/${id}/registration`);
    for (const name of ["My scorecard", "Live leaderboard"]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
      const locked = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(locked.disabled).toBe(true);
      expect(locked.getAttribute("aria-describedby")).toBe("event-tools-locked");
    }
    expect(document.getElementById("event-tools-locked")?.textContent).toContain("open when the competition starts");
  });
  it("opens the scorecard and leaderboard by itself when the start comes, and says so", async () => {
    vi.mocked(getMyEvents).mockResolvedValueOnce([waitingEvent()]).mockResolvedValue([startedEvent()]);
    renderPage(`/my-events/${id}`); await settle();
    expect(getMyEvents).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(getMyEvents).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("region", { name: "Countdown to the start" })).toBeNull();
    expect(screen.getByRole("link", { name: "My scorecard" }).getAttribute("href")).toBe(`/my-events/${id}/scorecard`);
    expect(screen.getByRole("link", { name: "Live leaderboard" }).getAttribute("href")).toBe(`/my-events/${id}/leaderboard`);
    expect(screen.getByText("The competition has started. Your scorecard and the live leaderboard are open.").getAttribute("role")).toBe("status");
    expect(screen.queryByText("Loading your events…")).toBeNull();
  });
  it("keeps the countdown and asks again, less and less often, while the server says the competition hasn't started", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([waitingEvent()]);
    renderPage(`/my-events/${id}`); await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(getMyEvents).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Starting now. This page opens by itself in a moment.").getAttribute("role")).toBe("status");
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(getMyEvents).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(3999); });
    expect(getMyEvents).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getMyEvents).toHaveBeenCalledTimes(4);
    expect((screen.getByRole("button", { name: "My scorecard" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Loading your events…")).toBeNull();
  });
  it("keeps what's shown when the check at the start fails", async () => {
    vi.mocked(getMyEvents).mockResolvedValueOnce([waitingEvent()]).mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Offline"));
    renderPage(`/my-events/${id}`); await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole("region", { name: "Countdown to the start" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("doesn't count down to a cancelled event, which has no start to wait for", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([waitingEvent({ status: "CANCELLED" })]);
    renderPage(`/my-events/${id}`); await settle();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByRole("link", { name: "My scorecard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Live leaderboard" })).toBeTruthy();
  });
});
