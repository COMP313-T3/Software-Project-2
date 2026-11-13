import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyEventsPage from "./MyEventsPage.tsx";
import { getMyEvents, type MyEvent } from "../lib/myEventsApi.ts";
import { ApiError } from "../lib/apiClient.ts";
import { clearAppStorage } from "../lib/appStorage.ts";
import { liveUpdates } from "../test/liveUpdates.ts";
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
  return { competition: { _id: index ? index.toString(16).padStart(24, "0") : id, name: index ? `Event ${index}` : "Autumn Open", date: "2026-11-20", location: "Toronto", gym: { _id: "507f1f77bcf86cd799439012", name: "North Wall" }, status: "PUBLISHED", registrationStatus: "CLOSED", startTime: null, startsAt: null, started: true, endTime: null, endsAt: null, ended: false }, registration: { registrationId: "507f1f77bcf86cd799439013", status: "CONFIRMED", registeredAt: "2026-10-20T15:00:00Z", division: { _id: "507f1f77bcf86cd799439014", name: "Open" } } };
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
let live: ReturnType<typeof liveUpdates>;
beforeEach(() => { role = "CLIMBER"; userId = "climber-one"; opened.mockClear(); scorecardOpened.mockClear(); vi.mocked(getMyEvents).mockReset().mockResolvedValue([eventFixture()]); live = liveUpdates(); });
afterEach(() => cleanup());
describe("My Events keeping itself current", () => {
  it("has no refresh button", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull();
  });
  it("shows a new registration by itself, without a loading message in between", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    let arrive!: (events: MyEvent[]) => void;
    vi.mocked(getMyEvents).mockReturnValueOnce(new Promise(done => { arrive = done; }));
    await live.announce([{ topic: "competitions" }]);
    expect(screen.getByRole("heading", { name: "Autumn Open" })).toBeTruthy();
    expect(screen.queryByText("Loading your events…")).toBeNull();
    await act(async () => arrive([eventFixture(), eventFixture(1)]));
    expect(screen.getByRole("heading", { name: "Event 1" })).toBeTruthy();
    expect(screen.getByText("2 events")).toBeTruthy();
  });
  it("follows a change to the event it has open", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    const cancelled = eventFixture(); cancelled.competition.status = "CANCELLED";
    vi.mocked(getMyEvents).mockResolvedValueOnce([cancelled]);
    await live.announce([{ topic: "competitions" }]);
    expect(await screen.findByText("This competition has been cancelled. Your saved registration is shown for reference.")).toBeTruthy();
  });
  it("reloads when a gym changes, and after the live connection came back", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    await live.announce([{ topic: "gyms" }]);
    expect(getMyEvents).toHaveBeenCalledTimes(2);
  });
  it("ignores changes to data it doesn't show", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    await live.announce([{ topic: "users" }, { topic: "gym-requests" }, { topic: "settings" }]);
    expect(getMyEvents).toHaveBeenCalledOnce();
  });
  it("keeps the events it shows when a live reload can't reach the server", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "fetch failed"));
    await live.announce([{ topic: "competitions" }]);
    expect(screen.getByRole("heading", { name: "Autumn Open" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("recovers by itself from a failed first read once something changes", async () => {
    vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "fetch failed")); renderPage();
    await screen.findByRole("alert");
    await live.announce(null);
    expect(await screen.findByRole("heading", { name: "Autumn Open" })).toBeTruthy();
  });
  it("stops listening when the page closes", async () => {
    const { unmount } = renderPage(); await screen.findByRole("heading", { name: "Autumn Open" });
    expect(live.listening()).toBe(1);
    unmount();
    expect(live.listening()).toBe(0);
  });
});
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
    expect(screen.getByText("For advice from the AI Route Assistant, open your scorecard or the live leaderboard and choose Topo, the Ask AI button at the bottom of the screen.")).toBeTruthy();
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
  it("clears old tool links and handles lost access safely when a live update finds it gone", async () => {
    renderPage(`/my-events/${id}`); await screen.findByRole("heading", { name: "Event tools" });
    vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "private trace"));
    await live.announce([{ topic: "competitions" }]);
    await screen.findByRole("alert"); expect(screen.queryByText(/private trace/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Live leaderboard" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Autumn Open" })).toBeNull();
  });
  it("offers sign-in when the login expired, and Try again after any other read failure", async () => {
    vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(401, "EXPIRED", "private")); renderPage();
    await screen.findByRole("alert"); expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    cleanup(); vi.mocked(getMyEvents).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "fetch failed")); renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" })); await screen.findByRole("heading", { name: "Autumn Open" });
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
    expect(screen.getByText("Time").nextElementSibling?.textContent).toBe("10:00 a.m. (Toronto time)");
  });
  it("shows the end time with the start time in the list and in the event's details", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([waitingEvent({ started: true, endTime: "18:00", endsAt: "2026-11-20T23:00:00.000Z" })]);
    renderPage(); await settle();
    expect(screen.getByText("Nov 20, 2026").parentElement?.textContent).toBe("Nov 20, 2026, 10:00 a.m. to 6:00 p.m. · Toronto");
    cleanup(); renderPage(`/my-events/${id}`); await settle();
    expect(screen.getByText("Time").nextElementSibling?.textContent).toBe("10:00 a.m. to 6:00 p.m. (Toronto time)");
  });
  it("counts down to the end while the competition is on, and reads the events again when it comes", async () => {
    vi.setSystemTime(new Date("2026-11-20T22:59:58.000Z"));
    const on = waitingEvent({ started: true, endTime: "18:00", endsAt: "2026-11-20T23:00:00.000Z", ended: false });
    const over = waitingEvent({ started: true, endTime: "18:00", endsAt: "2026-11-20T23:00:00.000Z", ended: true });
    vi.mocked(getMyEvents).mockResolvedValueOnce([on]).mockResolvedValue([over]);
    renderPage(`/my-events/${id}`); await settle();
    expect(screen.getByRole("region", { name: "When scoring closes" }).textContent).toContain("Scoring closes at 6:00 p.m.");
    expect(screen.getByRole("timer", { name: "Time until scoring closes" }).textContent).toContain("2 seconds left");

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(getMyEvents).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("region", { name: "When scoring closes" })).toBeNull();
    expect(screen.queryByText("The competition has started. Your scorecard and the live leaderboard are open.")).toBeNull();
  });
  it("leaves the start time out for an event saved without one", async () => {
    renderPage(`/my-events/${id}`); await settle();
    expect(screen.queryByText("Time")).toBeNull();
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

describe("AC-024 the warnings before the end, and the event after it", () => {
  const ENDS_AT = "2026-11-20T23:00:00.000Z";
  function eventEnding(ended = false) {
    const event = eventFixture();
    event.competition = { ...event.competition, startTime: "10:00", startsAt: "2026-11-20T15:00:00.000Z", started: true, endTime: "18:00", endsAt: ENDS_AT, ended };
    return event;
  }
  beforeEach(() => { clearAppStorage(); vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date("2026-11-20T22:45:00.000Z")); });
  afterEach(() => { vi.useRealTimers(); clearAppStorage(); });
  // The events load first, and the warning checks the time left once the event is on the page.
  const settle = async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  };

  it("warns 15 minutes before the end on the event page, with a way to the scorecard", async () => {
    vi.mocked(getMyEvents).mockResolvedValue([eventEnding()]);
    renderPage(`/my-events/${id}`); await settle();

    const warning = screen.getByRole("alertdialog", { name: "15 minutes left" });
    expect(warning.textContent).toContain("Scoring closes at 6:00 p.m. (Toronto time)");
    expect(within(warning).getByRole("link", { name: "Open My scorecard" }).getAttribute("href")).toBe(`/my-events/${id}/scorecard`);
  });

  it("offers the final leaderboard and no scorecard after the end, and says why", async () => {
    vi.setSystemTime(new Date("2026-11-20T23:30:00.000Z"));
    vi.mocked(getMyEvents).mockResolvedValue([eventEnding(true)]);
    renderPage(`/my-events/${id}`); await settle();

    const tools = screen.getByRole("region", { name: "Event tools" });
    expect(within(tools).queryByRole("link", { name: "My scorecard" })).toBeNull();
    expect(within(tools).getByRole("link", { name: "Final leaderboard" }).getAttribute("href")).toBe(`/my-events/${id}/leaderboard`);
    expect(tools.textContent).toContain("This competition is over, so your scorecard is closed. Your final place is on the final leaderboard.");
    expect(tools.textContent).toContain("open the final leaderboard and choose Topo");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("sends the scorecard's address to the final leaderboard after the end, without opening the scorecard", async () => {
    vi.setSystemTime(new Date("2026-11-20T23:30:00.000Z"));
    vi.mocked(getMyEvents).mockResolvedValue([eventEnding(true)]);
    renderPage(`/my-events/${id}/scorecard`); await settle();

    expect(scorecardOpened).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledWith({ audience: "climber", returnTo: `/my-events/${id}` });
  });

  it("says the scorecard is closed when the end comes while the event is open", async () => {
    vi.setSystemTime(new Date("2026-11-20T22:59:58.000Z"));
    vi.mocked(getMyEvents).mockResolvedValueOnce([eventEnding()]).mockResolvedValue([eventEnding(true)]);
    renderPage(`/my-events/${id}`); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByText("The competition is over. Your scorecard is closed, and the final leaderboard has the results.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "My scorecard" })).toBeNull();
  });
});
