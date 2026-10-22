import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { getCompetitionScoring, saveCompetitionScoring, type CompetitionScoring } from "../lib/scoringApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";
vi.mock("../lib/gymAdminApi.ts", () => ({ getManagedCompetition: vi.fn(), fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), updateManagedCompetition: vi.fn(), createManagedCompetition: vi.fn() }));
vi.mock("../lib/scoringApi.ts", () => ({ getCompetitionScoring: vi.fn(), saveCompetitionScoring: vi.fn() }));
const competition: ManagedCompetitionDetails = { _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "North Gym" }, name: "Autumn Open", date: "2027-11-14", location: "Toronto", status: "PUBLISHED", registrationStatus: "OPEN", capacity: 80, tools: [{ key: "scoring", label: "Scoring format", story: "US-018" }] };
const initial: CompetitionScoring = { competitionId: competition._id, scoring: { deductionPercent: 20, maxAttempts: 5, updatedAt: "2026-10-16T12:00:00Z" }, readiness: { routes: 3, routesWithoutPoints: 0, ready: true, warnings: [] } };
const description = "20% off for each failed attempt, up to 5 attempts";
const example = "A 100-point problem scores 100, 80, 60, 40 or 20 points, and 0 if it isn't topped.";
const path = `/gym-admin/competitions/${competition._id}/scoring`;
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate(path.replace(competition._id, "507f1f77bcf86cd799439019"))}>Other competition</button>; }
function page(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
const ready = () => screen.findByRole("form", { name: "Configure scoring format" });
const deduction = () => screen.getByLabelText("Deduction per failed attempt (%)") as HTMLInputElement;
const attempts = () => screen.getByLabelText("Maximum attempts per problem") as HTMLInputElement;
const enter = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const save = () => fireEvent.submit(screen.getByRole("form", { name: "Configure scoring format" }));
const saveButton = () => screen.getByRole("button", { name: "Save scoring format" }) as HTMLButtonElement;
const saved = () => within(screen.getByRole("region", { name: "Saved scoring format" }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(getCompetitionScoring).mockReset().mockResolvedValue(initial);
  vi.mocked(saveCompetitionScoring).mockReset().mockImplementation(async (_id, settings) => ({ ...initial, scoring: { ...settings, updatedAt: "2026-10-21T12:00:00Z" } }));
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("US018 #86/#87 scoring settings and saved format", () => {
  it("describes the selected event's saved settings and prefills them", async () => {
    page(); await ready(); expect(screen.getByRole("heading", { name: "Scoring format", level: 1 })).toBeTruthy();
    expect(saved().getByText(description)).toBeTruthy(); expect(saved().getByText(example)).toBeTruthy(); expect(saved().getByText(/Last saved/)).toBeTruthy();
    expect(deduction().value).toBe("20"); expect(attempts().value).toBe("5"); expect(saveButton().disabled).toBe(true);
    expect([deduction().min, deduction().max, deduction().step, attempts().min, attempts().max, attempts().step]).toEqual(["0", "99", "1", "1", "20", "1"]);
    expect(getCompetitionScoring).toHaveBeenCalledWith(competition._id, expect.any(AbortSignal)); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("opens through the competition management tool and preserves filters", async () => {
    page(path.replace("/scoring", "") + "?period=past"); const link = await screen.findByRole("link", { name: /Scoring format/ });
    expect(link.getAttribute("href")).toBe(path + "?period=past"); fireEvent.click(link); await ready();
    expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toContain("?period=past");
  });
  it.each([null, { format: "POINTS", flashBonus: 10 }])("starts unset scoring %j at the default settings without saving them", async scoring => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, scoring: scoring as CompetitionScoring["scoring"] }); page(); await ready();
    expect(saved().getByText("Not set")).toBeTruthy(); expect(saved().queryByText(example)).toBeNull();
    expect(deduction().value).toBe("20"); expect(attempts().value).toBe("5"); expect(saveCompetitionScoring).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(false); save();
    await screen.findByText("Scoring format saved."); expect(saveCompetitionScoring).toHaveBeenCalledWith(competition._id, { deductionPercent: 20, maxAttempts: 5 }, expect.any(AbortSignal));
    expect(saved().getByText(description)).toBeTruthy();
  });
  it("keeps the saved summary unchanged while editing", async () => {
    page(); await ready(); enter(deduction(), "10"); expect(saved().getByText(description)).toBeTruthy(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("waits for authoritative success and prevents repeated writes", async () => {
    const pending = deferred<CompetitionScoring>(); vi.mocked(saveCompetitionScoring).mockReturnValue(pending.promise); page(); await ready();
    enter(deduction(), "10"); enter(attempts(), "8"); save(); save();
    expect(saveCompetitionScoring).toHaveBeenCalledExactlyOnceWith(competition._id, { deductionPercent: 10, maxAttempts: 8 }, expect.any(AbortSignal));
    expect(saved().getByText(description)).toBeTruthy(); expect((screen.getByRole("button", { name: "Refresh scoring settings" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ...initial, scoring: { deductionPercent: 10, maxAttempts: 8, updatedAt: "2026-10-21T12:00:00Z" } })); await screen.findByText("Scoring format saved.");
    expect(saved().getByText("10% off for each failed attempt, up to 8 attempts")).toBeTruthy();
    expect(saved().getByText("A 100-point problem scores 100, 90, 80, 70, 60, 50, 40 or 30 points, and 0 if it isn't topped.")).toBeTruthy();
    expect(deduction().value).toBe("10"); expect(saveButton().disabled).toBe(true);
  });
  it.each(["", "-1", "0.5", "100"])("rejects deduction '%s' without a write", async value => {
    page(); await ready(); enter(deduction(), value); save();
    expect(await screen.findByText("Enter a whole-number percentage from 0 to 99.")).toBeTruthy(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
    expect(deduction().getAttribute("aria-invalid")).toBe("true"); expect(deduction().getAttribute("aria-describedby")).toBe("scoring-deductionPercent-help scoring-deductionPercent-error");
    await waitFor(() => expect(document.activeElement).toBe(deduction()));
  });
  it.each(["", "0", "21", "2.5"])("rejects '%s' attempts without a write", async value => {
    page(); await ready(); enter(attempts(), value); save();
    expect(await screen.findByText("Enter a whole number of attempts from 1 to 20.")).toBeTruthy(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
    expect(attempts().getAttribute("aria-invalid")).toBe("true"); await waitFor(() => expect(document.activeElement).toBe(attempts()));
  });
  it("explains the largest deduction so a top on the last attempt still scores", async () => {
    page(); await ready(); enter(deduction(), "30"); save();
    expect(await screen.findByText("With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores.")).toBeTruthy();
    expect(saveCompetitionScoring).not.toHaveBeenCalled(); await waitFor(() => expect(document.activeElement).toBe(deduction()));
    enter(attempts(), "3"); expect(screen.queryByText(/the deduction can be at most/)).toBeNull(); expect(deduction().getAttribute("aria-invalid")).toBe("false");
    save(); await screen.findByText("Scoring format saved."); expect(saveCompetitionScoring).toHaveBeenCalledWith(competition._id, { deductionPercent: 30, maxAttempts: 3 }, expect.any(AbortSignal));
  });
  it("discards changes to the last confirmed values", async () => {
    page(); await ready(); enter(deduction(), "10"); fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(deduction().value).toBe("20"); expect(saveButton().disabled).toBe(true); save(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("refreshes from the server rather than preserving unsaved values", async () => {
    page(); await ready(); enter(deduction(), "10"); fireEvent.click(screen.getByRole("button", { name: "Refresh scoring settings" })); await ready();
    expect(deduction().value).toBe("20"); expect(getCompetitionScoring).toHaveBeenCalledTimes(2);
  });
  it("displays saved readiness warnings without blocking a save", async () => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, readiness: { routes: 0, routesWithoutPoints: 0, ready: false, warnings: ["Add the competition's routes before results are entered."] } }); page(); await ready();
    expect(saved().getByText("Add the competition's routes before results are entered.")).toBeTruthy(); enter(deduction(), "10"); save(); await screen.findByText("Scoring format saved.");
  });
  it.each(["ADMIN", "CLIMBER"] as const)("denies the %s role before reading scoring settings", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other-role", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } }); page(); await screen.findByRole("heading", { name: "Gym administrator access required" }); expect(getManagedCompetition).not.toHaveBeenCalled(); expect(getCompetitionScoring).not.toHaveBeenCalled();
  });
  it.each([403, 404])("hides private settings after a %i read rejection", async status => {
    vi.mocked(getCompetitionScoring).mockRejectedValue(new ApiError(status, "DENIED", "Competition unavailable.")); page(); await screen.findByRole("alert"); expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText(competition.name)).toBeNull();
  });
  it("offers retry after a failed read without leaking an exception", async () => {
    vi.mocked(getCompetitionScoring).mockRejectedValueOnce(new Error("private database credential")); page(); expect(await screen.findByText("Couldn't load scoring settings. Please try again.")).toBeTruthy(); expect(screen.queryByText(/private database/)).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });
  it("preserves a failed edit and the saved summary with readable field feedback", async () => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields.", { deductionPercent: "Deduction rejected by server." })); page(); await ready();
    enter(deduction(), "10"); save(); await screen.findByText("Deduction rejected by server."); expect(saved().getByText(description)).toBeTruthy(); expect(deduction().value).toBe("10");
    await waitFor(() => expect(document.activeElement).toBe(deduction()));
  });
  it("does not claim success after an uncertain save", async () => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new Error("private database credential")); page(); await ready(); enter(deduction(), "10"); save();
    await screen.findByText(/Couldn't confirm the save/); expect(saved().getByText(description)).toBeTruthy(); expect(screen.queryByText("Scoring format saved.")).toBeNull(); expect(screen.queryByText(/private database/)).toBeNull();
  });
  it.each([403, 404])("removes private content after a %i write rejection", async status => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new ApiError(status, "DENIED", "Competition unavailable.")); page(); await ready(); enter(deduction(), "10"); save(); await screen.findByRole("heading", { name: "Scoring settings unavailable" }); expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText(competition.name)).toBeNull();
  });
  it.each([{ status: "CANCELLED" as const }, { date: "2000-01-01" }])("shows locked competition settings read-only %j", async changes => {
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...competition, ...changes }); page(); await ready(); expect(deduction().matches(":disabled")).toBe(true); expect(attempts().matches(":disabled")).toBe(true);
    expect(screen.getByText(/can't be changed/)).toBeTruthy(); save(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("handles a competition becoming locked during the save", async () => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new ApiError(409, "COMPETITION_FINISHED", "Scoring is now locked.")); page(); await ready(); enter(deduction(), "10"); save(); await screen.findByRole("alert"); expect(saveButton().disabled).toBe(true); expect(deduction().matches(":disabled")).toBe(true);
  });
  it("cancels a pending save and ignores its late response after selecting another event", async () => {
    const pending = deferred<CompetitionScoring>(); vi.mocked(saveCompetitionScoring).mockReturnValue(pending.promise); page(); await ready(); enter(deduction(), "10"); save(); const signal = vi.mocked(saveCompetitionScoring).mock.calls[0][2];
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...competition, _id: "507f1f77bcf86cd799439019", name: "Other Open" });
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, competitionId: "507f1f77bcf86cd799439019", scoring: null }); fireEvent.click(screen.getByRole("button", { name: "Other competition" })); await screen.findByText("Not set"); expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ ...initial, scoring: { deductionPercent: 10, maxAttempts: 5 } })); expect(saved().getByText("Not set")).toBeTruthy(); expect(screen.queryByText("Scoring format saved.")).toBeNull();
  });
});
