import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { getCompetitionScoring, listScoringFormats, saveCompetitionScoring, type CompetitionScoring, type ScoringFormatOption } from "../lib/scoringApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";
vi.mock("../lib/gymAdminApi.ts", () => ({ getManagedCompetition: vi.fn(), fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), updateManagedCompetition: vi.fn(), createManagedCompetition: vi.fn() }));
vi.mock("../lib/scoringApi.ts", () => ({ getCompetitionScoring: vi.fn(), listScoringFormats: vi.fn(), saveCompetitionScoring: vi.fn(), FLASH_BONUS_MAX: 1000 }));
const competition: ManagedCompetitionDetails = { _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "North Gym" }, name: "Autumn Open", date: "2027-11-14", location: "Toronto", status: "PUBLISHED", registrationStatus: "OPEN", capacity: 80, tools: [{ key: "scoring", label: "Scoring format", story: "US-018" }] };
const formats: ScoringFormatOption[] = [{ format: "TOPS", label: "Tops and attempts", description: "Most tops, then fewer attempts.", usesPointValues: false, allowsFlashBonus: false }, { format: "POINTS", label: "Points", description: "Route points and an optional flash bonus.", usesPointValues: true, allowsFlashBonus: true }];
const initial: CompetitionScoring = { competitionId: competition._id, scoring: { format: "TOPS", flashBonus: 0 }, readiness: { routes: 3, routesWithoutPoints: 0, ready: true, warnings: [] } };
const path = `/gym-admin/competitions/${competition._id}/scoring`;
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate(path.replace(competition._id, "507f1f77bcf86cd799439019"))}>Other competition</button>; }
function page(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
const ready = () => screen.findByRole("form", { name: "Configure scoring format" });
const choose = (name = "Points") => fireEvent.click(screen.getByRole("radio", { name }));
const save = () => fireEvent.submit(screen.getByRole("form", { name: "Configure scoring format" }));
const saved = () => within(screen.getByRole("region", { name: "Saved scoring format" }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(listScoringFormats).mockReset().mockResolvedValue({ formats });
  vi.mocked(getCompetitionScoring).mockReset().mockResolvedValue(initial);
  vi.mocked(saveCompetitionScoring).mockReset().mockImplementation(async (_id, settings) => ({ ...initial, scoring: { ...settings, updatedAt: "2026-10-16T12:00:00Z" } }));
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("US018 #86/#87 scoring selector and saved format", () => {
  it("loads the selected event's saved format and backend options", async () => {
    page(); await ready(); expect(screen.getByRole("heading", { name: "Scoring format", level: 1 })).toBeTruthy();
    expect(saved().getByText("Tops and attempts")).toBeTruthy(); expect((screen.getByRole("radio", { name: "Tops and attempts" }) as HTMLInputElement).checked).toBe(true);
    expect(getCompetitionScoring).toHaveBeenCalledWith(competition._id, expect.any(AbortSignal)); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("opens through the competition management tool and preserves filters", async () => {
    page(path.replace("/scoring", "") + "?period=past"); const link = await screen.findByRole("link", { name: /Scoring format/ });
    expect(link.getAttribute("href")).toBe(path + "?period=past"); fireEvent.click(link); await ready();
    expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toContain("?period=past");
  });
  it("shows an unconfigured event without silently picking or saving a default", async () => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, scoring: null }); page(); await ready();
    expect(saved().getByText("Not configured")).toBeTruthy(); expect(screen.getAllByRole("radio").every(item => !(item as HTMLInputElement).checked)).toBe(true); save();
    expect(await screen.findByText("Choose a supported scoring format.")).toBeTruthy(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("prefills saved Points and a genuine zero flash bonus", async () => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, scoring: { format: "POINTS", flashBonus: 0 } }); page(); await ready();
    expect((screen.getByLabelText("Flash bonus (points)") as HTMLInputElement).value).toBe("0"); expect(saved().getByText("0 points")).toBeTruthy();
  });
  it("keeps the saved summary unchanged while choosing another format", async () => {
    page(); await ready(); choose(); expect(saved().getByText("Tops and attempts")).toBeTruthy(); expect(saved().queryByText("Points", { exact: true })).toBeNull();
    expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("waits for authoritative success and prevents repeated writes", async () => {
    const pending = deferred<CompetitionScoring>(); vi.mocked(saveCompetitionScoring).mockReturnValue(pending.promise); page(); await ready(); choose();
    fireEvent.change(screen.getByLabelText("Flash bonus (points)"), { target: { value: "10" } }); save(); save();
    expect(saveCompetitionScoring).toHaveBeenCalledExactlyOnceWith(competition._id, { format: "POINTS", flashBonus: 10 }, expect.any(AbortSignal));
    expect(saved().getByText("Tops and attempts")).toBeTruthy(); expect((screen.getByRole("button", { name: "Refresh scoring settings" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ...initial, scoring: { format: "POINTS", flashBonus: 10 } })); await screen.findByText("Scoring format saved."); expect(saved().getByText("Points", { exact: true })).toBeTruthy(); expect(saved().getByText("10 points")).toBeTruthy();
  });
  it.each(["", "-1", "0.5", "1001"])("rejects invalid flash bonus '%s' without a write", async value => {
    page(); await ready(); choose(); fireEvent.change(screen.getByLabelText("Flash bonus (points)"), { target: { value } }); save();
    expect(await screen.findByText("Enter a whole number from 0 to 1000.")).toBeTruthy(); expect(saveCompetitionScoring).not.toHaveBeenCalled(); await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Flash bonus (points)")));
  });
  it("clears an inapplicable bonus when switching to Tops", async () => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, scoring: { format: "POINTS", flashBonus: 20 } }); page(); await ready(); choose("Tops and attempts"); save();
    await waitFor(() => expect(saveCompetitionScoring).toHaveBeenCalledWith(competition._id, { format: "TOPS", flashBonus: 0 }, expect.any(AbortSignal)));
  });
  it("discards changes to the last confirmed values", async () => {
    page(); await ready(); choose(); fireEvent.click(screen.getByRole("button", { name: "Discard changes" })); expect((screen.getByRole("radio", { name: "Tops and attempts" }) as HTMLInputElement).checked).toBe(true); expect(screen.queryByLabelText("Flash bonus (points)")).toBeNull(); save(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("refreshes from the server rather than preserving an unsaved selection", async () => {
    page(); await ready(); choose(); fireEvent.click(screen.getByRole("button", { name: "Refresh scoring settings" })); await ready(); expect((screen.getByRole("radio", { name: "Tops and attempts" }) as HTMLInputElement).checked).toBe(true); expect(getCompetitionScoring).toHaveBeenCalledTimes(2);
  });
  it("displays saved readiness warnings without blocking format selection", async () => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, readiness: { routes: 0, routesWithoutPoints: 0, ready: false, warnings: ["Add routes before entering results."] } }); page(); await ready(); expect(saved().getByText("Add routes before entering results.")).toBeTruthy(); choose(); save(); await screen.findByText("Scoring format saved.");
  });
  it("keeps an unknown saved format visible rather than replacing it with a default", async () => {
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, scoring: { format: "LEGACY", flashBonus: 0 } }); page(); await ready(); expect(saved().getByText("LEGACY")).toBeTruthy(); expect(screen.getAllByRole("radio").every(item => !(item as HTMLInputElement).checked)).toBe(true);
  });
  it.each(["ADMIN", "CLIMBER"] as const)("denies the %s role before reading scoring settings", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other-role", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } }); page(); await screen.findByRole("heading", { name: "Gym administrator access required" }); expect(getManagedCompetition).not.toHaveBeenCalled(); expect(getCompetitionScoring).not.toHaveBeenCalled();
  });
  it.each([403, 404])("hides private settings after a %i read rejection", async status => {
    vi.mocked(getCompetitionScoring).mockRejectedValue(new ApiError(status, "DENIED", "Competition unavailable.")); page(); await screen.findByRole("alert"); expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText(competition.name)).toBeNull();
  });
  it("offers retry after a failed read without leaking an exception", async () => {
    vi.mocked(listScoringFormats).mockRejectedValueOnce(new Error("private database credential")); page(); expect(await screen.findByText("Couldn't load scoring settings. Please try again.")).toBeTruthy(); expect(screen.queryByText(/private database/)).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });
  it("preserves a failed selection and the saved summary with readable field feedback", async () => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields.", { flashBonus: "Bonus rejected by server." })); page(); await ready(); choose(); save(); await screen.findByText("Bonus rejected by server."); expect(saved().getByText("Tops and attempts")).toBeTruthy(); expect((screen.getByRole("radio", { name: "Points" }) as HTMLInputElement).checked).toBe(true);
  });
  it("does not claim success after an uncertain save", async () => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new Error("private database credential")); page(); await ready(); choose(); save(); await screen.findByText(/Couldn't confirm the save/); expect(saved().getByText("Tops and attempts")).toBeTruthy(); expect(screen.queryByText("Scoring format saved.")).toBeNull(); expect(screen.queryByText(/private database/)).toBeNull();
  });
  it.each([403, 404])("removes private content after a %i write rejection", async status => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new ApiError(status, "DENIED", "Competition unavailable.")); page(); await ready(); choose(); save(); await screen.findByRole("heading", { name: "Scoring settings unavailable" }); expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText(competition.name)).toBeNull();
  });
  it.each([{ status: "CANCELLED" as const }, { date: "2000-01-01" }])("shows locked competition settings read-only %j", async changes => {
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...competition, ...changes }); page(); await ready(); expect(screen.getAllByRole("radio").every(item => item.matches(":disabled"))).toBe(true); save(); expect(saveCompetitionScoring).not.toHaveBeenCalled();
  });
  it("handles a competition becoming locked during the save", async () => {
    vi.mocked(saveCompetitionScoring).mockRejectedValue(new ApiError(409, "COMPETITION_FINISHED", "Scoring is now locked.")); page(); await ready(); choose(); save(); await screen.findByRole("alert"); expect((screen.getByRole("button", { name: "Save scoring format" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("handles an empty supported-format list", async () => {
    vi.mocked(listScoringFormats).mockResolvedValue({ formats: [] }); page(); await ready(); expect(screen.getByRole("alert").textContent).toContain("No scoring formats"); expect((screen.getByRole("button", { name: "Save scoring format" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("cancels a pending save and ignores its late response after selecting another event", async () => {
    const pending = deferred<CompetitionScoring>(); vi.mocked(saveCompetitionScoring).mockReturnValue(pending.promise); page(); await ready(); choose(); save(); const signal = vi.mocked(saveCompetitionScoring).mock.calls[0][2];
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...competition, _id: "507f1f77bcf86cd799439019", name: "Other Open" });
    vi.mocked(getCompetitionScoring).mockResolvedValue({ ...initial, competitionId: "507f1f77bcf86cd799439019", scoring: null }); fireEvent.click(screen.getByRole("button", { name: "Other competition" })); await screen.findByText("Not configured"); expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ ...initial, scoring: { format: "POINTS", flashBonus: 10 } })); expect(saved().getByText("Not configured")).toBeTruthy(); expect(screen.queryByText("Scoring format saved.")).toBeNull();
  });
});
