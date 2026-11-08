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
const id = "507f1f77bcf86cd799439011";
function eventFixture(index = 0): MyEvent {
  return { competition: { _id: index ? index.toString(16).padStart(24, "0") : id, name: index ? `Event ${index}` : "Autumn Open", date: "2026-11-20", location: "Toronto", gym: { _id: "507f1f77bcf86cd799439012", name: "North Wall" }, status: "PUBLISHED", registrationStatus: "CLOSED" }, registration: { registrationId: "507f1f77bcf86cd799439013", status: "CONFIRMED", registeredAt: "2026-10-20T15:00:00Z", division: { _id: "507f1f77bcf86cd799439014", name: "Open" } } };
}
function renderPage(path = "/my-events") {
  return render(<MemoryRouter initialEntries={[path]}><Link to={`/my-events/${id}/leaderboard`}>Direct tool</Link><Routes>
    <Route path="/my-events" element={<MyEventsPage />} />
    <Route path="/my-events/:competitionId" element={<MyEventsPage />} />
    <Route path="/my-events/:competitionId/leaderboard" element={<MyEventsPage tool="leaderboard" />} />
    <Route path="/my-events/:competitionId/registration" element={<MyEventsPage tool="registration" />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { role = "CLIMBER"; userId = "climber-one"; opened.mockClear(); vi.mocked(getMyEvents).mockReset().mockResolvedValue([eventFixture()]); });
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
