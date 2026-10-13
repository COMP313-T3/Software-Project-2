import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { assignClimberDivision, createCompetitionDivision, listCompetitionClimbers, listCompetitionDivisions, type CompetitionDivision, type ManagedClimberRegistration } from "../lib/divisionsApi.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/divisionsApi.ts", () => ({
  assignClimberDivision: vi.fn(), createCompetitionDivision: vi.fn(), listCompetitionClimbers: vi.fn(), listCompetitionDivisions: vi.fn(),
}));
vi.mock("../lib/gymAdminApi.ts", () => ({
  fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), getManagedCompetition: vi.fn(), createManagedCompetition: vi.fn(), updateManagedCompetition: vi.fn(),
}));
const competition: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" },
  name: "Autumn Open", date: "2026-11-14", location: "Toronto", status: "DRAFT", registrationStatus: "CLOSED", capacity: 80, tools: [],
};
const beginner: CompetitionDivision = { _id: "507f1f77bcf86cd799439021", competitionId: competition._id, name: "Beginner", climberCount: 1 };
const open: CompetitionDivision = { _id: "507f1f77bcf86cd799439022", competitionId: competition._id, name: "Open", climberCount: 1 };
const youth: CompetitionDivision = { _id: "507f1f77bcf86cd799439023", competitionId: competition._id, name: "Youth", climberCount: 0 };
const ada: ManagedClimberRegistration = {
  registrationId: "507f1f77bcf86cd799439041", registeredAt: "2026-10-12T17:00:00Z", status: "CONFIRMED",
  climber: { _id: "507f1f77bcf86cd799439031", firstName: "Ada", lastName: "Climber", email: "ada@example.com" },
  division: { _id: beginner._id, name: beginner.name },
};
const sam: ManagedClimberRegistration = {
  ...ada, registrationId: "507f1f77bcf86cd799439042", status: "WAITLIST",
  climber: { _id: "507f1f77bcf86cd799439032", firstName: "Sam", lastName: "Boulderer", email: "sam@example.com" },
  division: { _id: open._id, name: open.name },
};
const path = "/gym-admin/competitions/" + competition._id + "/divisions";
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/gym-admin/competitions/507f1f77bcf86cd799439099/divisions")}>Select other competition</button>;
}
function renderPage(url = path) {
  return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function ready() { return screen.findByRole("form", { name: "Create division" }); }
function row(name: string) { return screen.getByRole("heading", { name, level: 3 }).closest("li")!; }
beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(listCompetitionDivisions).mockReset().mockResolvedValue({ divisions: [beginner, open] });
  vi.mocked(listCompetitionClimbers).mockReset().mockResolvedValue({ climbers: [ada, sam], total: 2 });
  vi.mocked(createCompetitionDivision).mockReset().mockResolvedValue(youth);
  vi.mocked(assignClimberDivision).mockReset().mockResolvedValue({ ...ada, division: { _id: open._id, name: open.name } });
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-014 division management and registered climber list", () => {
  it("loads the selected competition and shows divisions, names, emails and registration status", async () => {
    renderPage(); await ready();
    expect(screen.getByRole("heading", { name: "Divisions and climbers", level: 1 })).toBeTruthy();
    expect(screen.getByText("Autumn Open")).toBeTruthy();
    expect(screen.getByText(/Brian Test Gym/)).toBeTruthy();
    expect(within(row("Ada Climber")).getByText("ada@example.com")).toBeTruthy();
    expect(within(row("Sam Boulderer")).getByText("Waitlisted")).toBeTruthy();
    expect(within(row("Ada Climber")).getByText("Confirmed")).toBeTruthy();
    expect(screen.getByText("2 total registrations · 1 confirmed in this competition")).toBeTruthy();
    expect(listCompetitionDivisions).toHaveBeenCalledWith(competition._id, expect.any(AbortSignal));
    expect(listCompetitionClimbers).toHaveBeenCalledWith(competition._id, undefined, expect.any(AbortSignal));
  });
  it("keeps list, gym and period filters on the return link", async () => {
    const search = "?period=past&gymId=" + competition.gymId + "&page=2";
    renderPage(path + search); await ready();
    expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toBe("/gym-admin/competitions/" + competition._id + search);
  });
  it("waits for competition authorization before starting the private lists", async () => {
    const pending = deferred<ManagedCompetitionDetails>();
    vi.mocked(getManagedCompetition).mockReturnValue(pending.promise);
    renderPage();
    expect(await screen.findByText("Loading divisions and climbers…")).toBeTruthy();
    expect(listCompetitionDivisions).not.toHaveBeenCalled();
    expect(listCompetitionClimbers).not.toHaveBeenCalled();
    await act(async () => pending.resolve(competition));
    await ready();
  });
  it("focuses the division name and exposes the exact backend length limit", async () => {
    renderPage(); await ready();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Division name")));
    expect((screen.getByLabelText("Division name") as HTMLInputElement).maxLength).toBe(50);
  });
  it.each(["", "   ", "x".repeat(51)])("rejects an invalid division name before writing (%j)", async name => {
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: name } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(createCompetitionDivision).not.toHaveBeenCalled();
  });
  it("adds the API-confirmed division and clears its name after creation", async () => {
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: "  Youth  " } });
    fireEvent.submit(form);
    expect(await screen.findByText('Division "Youth" created.')).toBeTruthy();
    expect(createCompetitionDivision).toHaveBeenCalledWith(competition._id, { name: "Youth" }, expect.any(AbortSignal));
    expect(within(screen.getByRole("list", { name: "Divisions" })).getByText("Youth")).toBeTruthy();
    expect((screen.getByLabelText("Division name") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Division name")));
  });
  it("blocks repeated creation and other writes until the first save finishes", async () => {
    const pending = deferred<CompetitionDivision>();
    vi.mocked(createCompetitionDivision).mockReturnValue(pending.promise);
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: "Youth" } });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(createCompetitionDivision).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Refresh divisions and climbers" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Division for Ada Climber") as HTMLSelectElement).disabled).toBe(true);
    expect(within(screen.getByRole("list", { name: "Divisions" })).queryByText("Youth")).toBeNull();
    await act(async () => pending.resolve(youth));
    expect(await screen.findByText('Division "Youth" created.')).toBeTruthy();
  });
  it.each([400, 409])("keeps a rejected name and focuses its server validation message (%s)", async status => {
    const message = "This competition already has a division with this name.";
    vi.mocked(createCompetitionDivision).mockRejectedValue(new ApiError(status, status === 409 ? "DIVISION_EXISTS" : "VALIDATION_ERROR", "Check the fields.", { name: message }));
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: "Open" } });
    fireEvent.submit(form);
    expect(await screen.findByText(message)).toBeTruthy();
    expect((screen.getByLabelText("Division name") as HTMLInputElement).value).toBe("Open");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Division name")));
    expect(screen.queryByText(/Division "Open" created/)).toBeNull();
  });
  it.each([
    new ApiError(0, "NETWORK_ERROR", "Offline"), new ApiError(0, "TIMEOUT", "Timeout"),
    new ApiError(500, "INTERNAL_ERROR", "private database secret"), new Error("private database secret"),
  ])("does not confirm an uncertain creation or expose internal details", async error => {
    vi.mocked(createCompetitionDivision).mockRejectedValue(error);
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: "Youth" } });
    fireEvent.submit(form);
    expect(await screen.findByText("Couldn't confirm the division save. Refresh the list before trying again.")).toBeTruthy();
    expect((screen.getByLabelText("Division name") as HTMLInputElement).value).toBe("Youth");
    expect(screen.queryByText(/private database secret/)).toBeNull();
    expect(within(screen.getByRole("list", { name: "Divisions" })).queryByText("Youth")).toBeNull();
  });
  it("filters the registration list using divisions from this competition", async () => {
    vi.mocked(listCompetitionDivisions).mockResolvedValue({ divisions: [beginner, open, youth] });
    renderPage(); await ready();
    const filter = screen.getByLabelText("Show division");
    fireEvent.change(filter, { target: { value: open._id } });
    expect(screen.queryByRole("heading", { name: "Ada Climber" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Sam Boulderer" })).toBeTruthy();
    fireEvent.change(filter, { target: { value: youth._id } });
    expect(screen.getByText("No climbers in this division.")).toBeTruthy();
    fireEvent.change(filter, { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "Ada Climber" })).toBeTruthy();
  });
  it("shows only current-competition choices and disables an unchanged assignment", async () => {
    renderPage(); await ready();
    const control = within(row("Ada Climber"));
    const select = screen.getByLabelText("Division for Ada Climber") as HTMLSelectElement;
    expect([...select.options].map(option => option.value)).toEqual(["", beginner._id, open._id]);
    expect((control.getByRole("button", { name: "Save division" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("moves the selected climber by user ID and updates the current division and counts after confirmation", async () => {
    const pending = deferred<ManagedClimberRegistration>();
    vi.mocked(assignClimberDivision).mockReturnValue(pending.promise);
    renderPage(); await ready();
    fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: open._id } });
    fireEvent.submit(screen.getByRole("form", { name: "Assign division for Ada Climber" }));
    expect(assignClimberDivision).toHaveBeenCalledWith(competition._id, ada.climber!._id, open._id, expect.any(AbortSignal));
    expect(within(row("Ada Climber")).getByText("Beginner", { selector: "p" })).toBeTruthy();
    await act(async () => pending.resolve({ ...ada, division: { _id: open._id, name: "Open" } }));
    expect(await screen.findByText('Ada Climber is assigned to "Open".')).toBeTruthy();
    expect(within(row("Ada Climber")).getByText("Open", { selector: "p" })).toBeTruthy();
    const cards = screen.getByRole("list", { name: "Divisions" });
    expect(within(cards).getByText("Beginner").parentElement?.textContent).toContain("0 registrations");
    expect(within(cards).getByText("Open").parentElement?.textContent).toContain("2 registrations");
  });
  it("moves a filtered row out of the view and leaves focus on the filter", async () => {
    renderPage(); await ready();
    fireEvent.change(screen.getByLabelText("Show division"), { target: { value: beginner._id } });
    fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: open._id } });
    fireEvent.submit(screen.getByRole("form", { name: "Assign division for Ada Climber" }));
    expect(await screen.findByText('Ada Climber is assigned to "Open".')).toBeTruthy();
    expect(screen.getByText("No climbers in this division.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Show division")));
  });
  it("assigns a registration whose previous division is unavailable", async () => {
    vi.mocked(listCompetitionClimbers).mockResolvedValue({ climbers: [{ ...ada, division: null }], total: 1 });
    renderPage(); await ready();
    expect(within(row("Ada Climber")).getByText("No available division assigned")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: open._id } });
    fireEvent.click(within(row("Ada Climber")).getByRole("button", { name: "Assign division" }));
    expect(await screen.findByText('Ada Climber is assigned to "Open".')).toBeTruthy();
  });
  it("never displays or selects a division outside the loaded catalog", async () => {
    vi.mocked(listCompetitionClimbers).mockResolvedValue({ climbers: [{ ...ada, division: { _id: "foreign", name: "Foreign event division" } }], total: 1 });
    renderPage(); await ready();
    expect(screen.queryByText("Foreign event division")).toBeNull();
    expect((screen.getByLabelText("Division for Ada Climber") as HTMLSelectElement).value).toBe("");
  });
  it.each([400, 404])("keeps the last confirmed assignment after a rejected move (%s)", async status => {
    const message = status === 400 ? "Choose a division from this competition." : "This Climber isn't registered for this competition.";
    vi.mocked(assignClimberDivision).mockRejectedValue(new ApiError(status, status === 400 ? "VALIDATION_ERROR" : "REGISTRATION_NOT_FOUND", message, status === 400 ? { divisionId: message } : undefined));
    renderPage(); await ready();
    fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: open._id } });
    fireEvent.submit(screen.getByRole("form", { name: "Assign division for Ada Climber" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(within(row("Ada Climber")).getByText("Beginner", { selector: "p" })).toBeTruthy();
    expect((screen.getByLabelText("Division for Ada Climber") as HTMLSelectElement).value).toBe(open._id);
    expect(screen.queryByText(/Ada Climber is assigned/)).toBeNull();
  });
  it("keeps the old assignment after a network failure and advises checking before retry", async () => {
    vi.mocked(assignClimberDivision).mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Offline"));
    renderPage(); await ready();
    fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: open._id } });
    fireEvent.submit(screen.getByRole("form", { name: "Assign division for Ada Climber" }));
    expect(await screen.findByText("Couldn't confirm the assignment. Refresh the list before trying again.")).toBeTruthy();
    expect(within(row("Ada Climber")).getByText("Beginner", { selector: "p" })).toBeTruthy();
  });
  it("blocks repeated assignment submissions", async () => {
    const pending = deferred<ManagedClimberRegistration>();
    vi.mocked(assignClimberDivision).mockReturnValue(pending.promise);
    renderPage(); await ready();
    fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: open._id } });
    const form = screen.getByRole("form", { name: "Assign division for Ada Climber" });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(assignClimberDivision).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ ...ada, division: { _id: open._id, name: "Open" } }));
  });
  it("shows explicit empty division and registration states", async () => {
    vi.mocked(listCompetitionDivisions).mockResolvedValue({ divisions: [] });
    vi.mocked(listCompetitionClimbers).mockResolvedValue({ climbers: [], total: 0 });
    renderPage(); await ready();
    expect(screen.getByText("No divisions yet. Create the first division for this competition.")).toBeTruthy();
    expect(screen.getByText("No climber registrations for this competition yet.")).toBeTruthy();
  });
  it("disables assignment until the event has a division", async () => {
    vi.mocked(listCompetitionDivisions).mockResolvedValue({ divisions: [] });
    renderPage(); await ready();
    expect(screen.getAllByText("Create a division to assign this climber.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Assign division" })).toBeNull();
  });
  it("shows missing accounts safely and never sends a write without a climber ID", async () => {
    vi.mocked(listCompetitionClimbers).mockResolvedValue({ climbers: [{ ...ada, climber: null }], total: 1 });
    renderPage(); await ready();
    expect(screen.getByRole("heading", { name: "Account unavailable", level: 3 })).toBeTruthy();
    expect(screen.queryByRole("form", { name: /Assign division for/ })).toBeNull();
    expect(assignClimberDivision).not.toHaveBeenCalled();
  });
  it("clears old lists during refresh and reloads the backend's current assignment and counts", async () => {
    renderPage(); await ready();
    const pending = deferred<{ divisions: CompetitionDivision[] }>();
    vi.mocked(listCompetitionDivisions).mockReturnValueOnce(pending.promise);
    vi.mocked(listCompetitionClimbers).mockResolvedValue({ climbers: [{ ...ada, division: { _id: open._id, name: "Open" } }], total: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh divisions and climbers" }));
    expect(screen.getByText("Loading divisions and climbers…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ada Climber" })).toBeNull();
    await act(async () => pending.resolve({ divisions: [beginner, { ...open, climberCount: 1 }] }));
    await ready();
    expect(within(row("Ada Climber")).getByText("Open", { selector: "p" })).toBeTruthy();
  });
  it("hides internal read errors and retries all data safely", async () => {
    vi.mocked(listCompetitionClimbers).mockRejectedValueOnce(new Error("private database secret"));
    renderPage();
    expect(await screen.findByText("Couldn't load divisions and climbers. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private database secret/)).toBeNull();
    expect(screen.queryByRole("form", { name: "Create division" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
  });
  it.each([401, 403, 404])("does not start the private lists after competition access fails (%s)", async status => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(status, "COMPETITION_NOT_FOUND", "Competition unavailable."));
    renderPage();
    expect(await screen.findByText("Competition unavailable.")).toBeTruthy();
    expect(listCompetitionDivisions).not.toHaveBeenCalled();
    expect(listCompetitionClimbers).not.toHaveBeenCalled();
  });
  it("hides all private data and controls when access is revoked during a save", async () => {
    vi.mocked(createCompetitionDivision).mockRejectedValue(new ApiError(403, "NO_ASSIGNED_GYM", "Your gym assignment is unavailable."));
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: "Youth" } });
    fireEvent.submit(form);
    expect(await screen.findByText("Your gym assignment is unavailable.")).toBeTruthy();
    expect(screen.queryByText("Autumn Open")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Ada Climber" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Create division" })).toBeNull();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("refuses %s before any competition API request", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled();
    expect(listCompetitionDivisions).not.toHaveBeenCalled();
  });
  it("requires login for direct links", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: false });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled();
  });
  it("aborts an initial read on unmount and ignores its late reply", async () => {
    const pending = deferred<ManagedCompetitionDetails>();
    vi.mocked(getManagedCompetition).mockReturnValue(pending.promise);
    const view = renderPage();
    await screen.findByText("Loading divisions and climbers…");
    const signal = vi.mocked(getManagedCompetition).mock.calls[0][1]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(competition));
    expect(listCompetitionDivisions).not.toHaveBeenCalled();
  });
  it("aborts a pending mutation on navigation and never applies its late response to another competition", async () => {
    const pending = deferred<CompetitionDivision>();
    vi.mocked(createCompetitionDivision).mockReturnValue(pending.promise);
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText("Division name"), { target: { value: "Youth" } });
    fireEvent.submit(form);
    const signal = vi.mocked(createCompetitionDivision).mock.calls[0][2]!;
    fireEvent.click(screen.getByRole("button", { name: "Select other competition" }));
    await ready();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(youth));
    expect(screen.queryByText('Division "Youth" created.')).toBeNull();
    expect(within(screen.getByRole("list", { name: "Divisions" })).queryByText("Youth")).toBeNull();
    expect(getManagedCompetition).toHaveBeenLastCalledWith("507f1f77bcf86cd799439099", expect.any(AbortSignal));
  });
});
