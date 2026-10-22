import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getClimberDetails, removeClimberRegistration, updateClimberDetails } from "../lib/climberDetailsApi.ts";
import { listCompetitionClimbers, listCompetitionDivisions, type CompetitionDivision, type ManagedClimberRegistration } from "../lib/divisionsApi.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/climberDetailsApi.ts", () => ({ getClimberDetails: vi.fn(), updateClimberDetails: vi.fn(), removeClimberRegistration: vi.fn() }));
vi.mock("../lib/divisionsApi.ts", () => ({ listCompetitionDivisions: vi.fn(), listCompetitionClimbers: vi.fn(), createCompetitionDivision: vi.fn(), assignClimberDivision: vi.fn() }));
vi.mock("../lib/gymAdminApi.ts", () => ({ fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), getManagedCompetition: vi.fn(), createManagedCompetition: vi.fn(), updateManagedCompetition: vi.fn() }));

const competition: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" },
  name: "Autumn Open", date: "2026-11-14", location: "Toronto", capacity: 80, status: "DRAFT", registrationStatus: "CLOSED", tools: [],
};
const beginner: CompetitionDivision = { _id: "507f1f77bcf86cd799439021", competitionId: competition._id, name: "Beginner", climberCount: 1 };
const open: CompetitionDivision = { _id: "507f1f77bcf86cd799439022", competitionId: competition._id, name: "Open", climberCount: 0 };
const ada: ManagedClimberRegistration = {
  registrationId: "507f1f77bcf86cd799439041", registeredAt: "2026-10-13T12:00:00Z", status: "CONFIRMED",
  climber: { _id: "507f1f77bcf86cd799439031", firstName: "Ada", lastName: "Climber", email: "ada@example.com" },
  division: { _id: beginner._id, name: beginner.name },
};
const sam: ManagedClimberRegistration = { ...ada, registrationId: "507f1f77bcf86cd799439042",
  climber: { _id: "507f1f77bcf86cd799439032", firstName: "Sam", lastName: "Boulderer", email: "sam@example.com" } };
const updated = { ...ada, division: { _id: open._id, name: open.name } };
const path = "/gym-admin/competitions/" + competition._id + "/climbers/" + ada.climber!._id;
const otherCompetition = "507f1f77bcf86cd799439019";
function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(path.replace(competition._id, otherCompetition))}>Select other competition</button>
    <button onClick={() => navigate(path.replace(ada.climber!._id, sam.climber!._id))}>Select other climber</button></>;
}
function renderPage(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function ready() { return screen.findByRole("form", { name: "Assign division for Ada Climber" }); }
function selectDivision(divisionId = open._id) { fireEvent.change(screen.getByLabelText("Division for Ada Climber"), { target: { value: divisionId } }); }
function currentDivision() { return screen.getByText("Current division", { selector: "dt" }).nextElementSibling!.textContent; }
async function confirmRemoval() { fireEvent.click(await screen.findByRole("button", { name: "Remove registration" })); return screen.getByRole("button", { name: "Confirm removal" }); }

beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(getClimberDetails).mockReset().mockResolvedValue(ada);
  vi.mocked(listCompetitionDivisions).mockReset().mockResolvedValue({ divisions: [beginner, open] });
  vi.mocked(listCompetitionClimbers).mockReset().mockResolvedValue({ climbers: [ada, sam], total: 2 });
  vi.mocked(updateClimberDetails).mockReset().mockResolvedValue(updated);
  vi.mocked(removeClimberRegistration).mockReset().mockResolvedValue(undefined);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-015 #68 Climber details, permitted editing and removal", () => {
  it("opens the selected Climber's event details without editable account/profile fields", async () => {
    renderPage(); await ready();
    expect(screen.getByRole("heading", { name: "Climber details", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ada Climber", level: 2 })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy(); expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(screen.getByText("Autumn Open")).toBeTruthy(); expect(screen.getByText(/Brian Test Gym/)).toBeTruthy();
    expect(screen.getByText("Toronto")).toBeTruthy(); expect(screen.getByText("Nov 14, 2026")).toBeTruthy();
    expect(screen.getByText("Oct 13, 2026, 8:00 a.m.")).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(ada.registeredAt);
    expect(document.title).toBe("Climber Details | TopSend");
    expect(currentDivision()).toBe("Beginner"); expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox", { name: /status/i })).toBeNull();
    expect(getClimberDetails).toHaveBeenCalledWith(competition._id, ada.climber!._id, expect.any(AbortSignal));
    expect(listCompetitionDivisions).toHaveBeenCalledWith(competition._id, expect.any(AbortSignal));
  });
  it("preserves competition-list and division filters on the back link", async () => {
    const search = "?period=past&gymId=" + competition.gymId + "&page=2&divisionId=" + beginner._id;
    renderPage(path + search); await ready();
    expect(screen.getByRole("link", { name: "Back to divisions and climbers" }).getAttribute("href"))
      .toBe("/gym-admin/competitions/" + competition._id + "/divisions" + search);
  });
  it("waits for competition authorization before loading Climber and division data", async () => {
    const pending = deferred<ManagedCompetitionDetails>(); vi.mocked(getManagedCompetition).mockReturnValue(pending.promise);
    renderPage(); expect(await screen.findByText("Loading climber details…")).toBeTruthy();
    expect(getClimberDetails).not.toHaveBeenCalled(); expect(listCompetitionDivisions).not.toHaveBeenCalled();
    await act(async () => pending.resolve(competition)); await ready();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s before private event reads", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "wrong-role", email: "user@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled(); expect(getClimberDetails).not.toHaveBeenCalled();
  });
  it("requires a session before a Visitor can open the page", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(); expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled(); expect(getClimberDetails).not.toHaveBeenCalled();
  });
  it("does not query Climber data when another gym's competition is unavailable", async () => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."));
    renderPage(); expect(await screen.findByText("Competition not found.")).toBeTruthy();
    expect(getClimberDetails).not.toHaveBeenCalled(); expect(listCompetitionDivisions).not.toHaveBeenCalled();
  });
  it("explains a malformed competition link without offering a retry", async () => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", { competitionId: "Invalid competition id." }));
    renderPage(path.replace(competition._id, "not-a-competition")); expect(await screen.findByText("This competition link isn't valid.")).toBeTruthy();
    expect(screen.queryByText("Check the fields and try again.")).toBeNull(); expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(getClimberDetails).not.toHaveBeenCalled();
  });
  it("shows a missing-registration error without edit or remove controls", async () => {
    vi.mocked(getClimberDetails).mockRejectedValue(new ApiError(404, "REGISTRATION_NOT_FOUND", "This Climber isn't registered for this competition."));
    renderPage(); expect(await screen.findByText("This Climber isn't registered for this competition.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove registration" })).toBeNull(); expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("offers a readable load retry without exposing internal errors", async () => {
    vi.mocked(getClimberDetails).mockRejectedValueOnce(new Error("private database password"));
    renderPage(); expect(await screen.findByText("Couldn't load climber details. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private database/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });
  it.each(["PENDING", "WAITLIST", "CONFIRMED"] as const)("shows %s as read-only registration information", async status => {
    vi.mocked(getClimberDetails).mockResolvedValue({ ...ada, status }); renderPage(); await ready();
    expect(screen.getByText({ PENDING: "Pending", WAITLIST: "Waitlisted", CONFIRMED: "Confirmed" }[status])).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /status/i })).toBeNull();
  });
  it("handles unavailable account, division and registration date information without crashing", async () => {
    vi.mocked(getClimberDetails).mockResolvedValue({ ...ada, climber: null, division: null, registeredAt: "invalid" });
    renderPage(); expect(await screen.findByRole("heading", { name: "Account unavailable" })).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy(); expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("offers division creation when no divisions exist", async () => {
    vi.mocked(listCompetitionDivisions).mockResolvedValue({ divisions: [] });
    renderPage(); expect(await screen.findByText("Create a division to assign this climber.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create a competition division" }).getAttribute("href"))
      .toBe("/gym-admin/competitions/" + competition._id + "/divisions");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("never offers or displays an unavailable foreign division name", async () => {
    vi.mocked(getClimberDetails).mockResolvedValue({ ...ada, division: { _id: "foreign", name: "Foreign private division" } });
    renderPage(); await ready();
    expect(currentDivision()).toBe("No available division assigned"); expect(screen.queryByText("Foreign private division")).toBeNull();
    expect(within(screen.getByLabelText("Division for Ada Climber")).getAllByRole("option").map(option => option.textContent))
      .toEqual(["Choose division", "Beginner", "Open"]);
  });
  it("does not submit an unchanged or empty division selection", async () => {
    renderPage(); const form = await ready();
    expect((screen.getByRole("button", { name: "Save division" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(form); expect(updateClimberDetails).not.toHaveBeenCalled();
    selectDivision(""); expect((screen.getByRole("button", { name: "Save division" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("updates via PATCH using the route's Climber user ID and waits for confirmed values", async () => {
    const pending = deferred<ManagedClimberRegistration>(); vi.mocked(updateClimberDetails).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); selectDivision(); fireEvent.submit(form);
    expect(currentDivision()).toBe("Beginner");
    expect(updateClimberDetails).toHaveBeenCalledWith(competition._id, ada.climber!._id, { divisionId: open._id }, expect.any(AbortSignal));
    await act(async () => pending.resolve(updated)); expect(await screen.findByText('Division saved as "Open".')).toBeTruthy();
    expect(currentDivision()).toBe("Open"); expect(screen.getByText("Confirmed")).toBeTruthy();
  });
  it("serializes edits and blocks removal and refresh while a save is pending", async () => {
    const pending = deferred<ManagedClimberRegistration>(); vi.mocked(updateClimberDetails).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); selectDivision(); fireEvent.submit(form); fireEvent.submit(form);
    expect(updateClimberDetails).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Refresh climber details" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Remove registration" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve(updated)); await screen.findByText('Division saved as "Open".');
  });
  it("preserves confirmed information and focuses rejected division feedback", async () => {
    vi.mocked(updateClimberDetails).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields.", { divisionId: "Choose a division from this competition." }));
    renderPage(); const form = await ready(); selectDivision(); fireEvent.submit(form);
    expect(await screen.findByText("Choose a division from this competition.")).toBeTruthy(); expect(currentDivision()).toBe("Beginner");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Division for Ada Climber")));
  });
  it.each([new ApiError(0, "NETWORK_ERROR", "Offline"), new ApiError(0, "TIMEOUT", "Timeout"), new ApiError(500, "INTERNAL_ERROR", "private credential"), new Error("private credential")])
    ("does not confirm an uncertain edit or disclose an internal error", async error => {
      vi.mocked(updateClimberDetails).mockRejectedValue(error);
      renderPage(); const form = await ready(); selectDivision(); fireEvent.submit(form);
      expect(await screen.findByText("Couldn't confirm the assignment. Refresh the list before trying again.")).toBeTruthy();
      expect(currentDivision()).toBe("Beginner"); expect(screen.queryByText(/private credential/)).toBeNull();
    });
  it("re-fetches authoritative registration details after refresh", async () => {
    renderPage(); await ready(); vi.mocked(getClimberDetails).mockResolvedValue(updated);
    fireEvent.click(screen.getByRole("button", { name: "Refresh climber details" })); await waitFor(() => expect(currentDivision()).toBe("Open"));
    expect((screen.getByLabelText("Division for Ada Climber") as HTMLSelectElement).value).toBe(open._id);
  });
  it("requires a separate removal confirmation and supports cancel without a write", async () => {
    renderPage(); await ready(); await confirmRemoval(); expect(removeClimberRegistration).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm removal" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(removeClimberRegistration).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm removal" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove registration" })));
  });
  it("removes only the selected registration after the API confirms deletion", async () => {
    const pending = deferred<void>(); vi.mocked(removeClimberRegistration).mockReturnValue(pending.promise);
    renderPage(); await ready(); fireEvent.click(await confirmRemoval());
    expect(removeClimberRegistration).toHaveBeenCalledWith(competition._id, ada.climber!._id, expect.any(AbortSignal));
    expect(screen.queryByRole("heading", { name: "Climber removed from competition" })).toBeNull();
    await act(async () => pending.resolve(undefined));
    const heading = await screen.findByRole("heading", { name: "Climber removed from competition" });
    await waitFor(() => expect(document.activeElement).toBe(heading)); expect(screen.queryByRole("form")).toBeNull();
    expect(screen.getByRole("link", { name: "View remaining climbers" }).getAttribute("href"))
      .toBe("/gym-admin/competitions/" + competition._id + "/divisions");
  });
  it("blocks repeated removal, edits and cancellation while deletion is pending", async () => {
    const pending = deferred<void>(); vi.mocked(removeClimberRegistration).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); selectDivision(); const confirm = await confirmRemoval();
    fireEvent.click(confirm); fireEvent.click(confirm); fireEvent.submit(form);
    expect(removeClimberRegistration).toHaveBeenCalledOnce(); expect(updateClimberDetails).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve(undefined)); await screen.findByRole("heading", { name: "Climber removed from competition" });
  });
  it.each([new ApiError(0, "NETWORK_ERROR", "Offline"), new ApiError(0, "TIMEOUT", "Timeout"), new ApiError(500, "INTERNAL_ERROR", "private credential"), new Error("private credential")])
    ("keeps registration data when removal is not confirmed", async error => {
      vi.mocked(removeClimberRegistration).mockRejectedValue(error);
      renderPage(); await ready(); fireEvent.click(await confirmRemoval());
      expect(await screen.findByText("Couldn't confirm removal. Refresh climber details before trying again.")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Ada Climber" })).toBeTruthy(); expect(screen.queryByText(/private credential/)).toBeNull();
      expect(screen.queryByRole("heading", { name: "Climber removed from competition" })).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm removal" })));
    });
  it.each([401, 403, 404])("hides private details and controls when edit access is lost (%s)", async status => {
    vi.mocked(updateClimberDetails).mockRejectedValue(new ApiError(status, status === 404 ? "REGISTRATION_NOT_FOUND" : "ACCESS_DENIED", "Registration access unavailable."));
    renderPage(); const form = await ready(); selectDivision(); fireEvent.submit(form);
    expect(await screen.findByText("Registration access unavailable.")).toBeTruthy();
    expect(screen.queryByText("ada@example.com")).toBeNull(); expect(screen.queryByRole("button", { name: "Remove registration" })).toBeNull();
  });
  it("does not call an already removed registration a successful removal", async () => {
    vi.mocked(removeClimberRegistration).mockRejectedValue(new ApiError(404, "REGISTRATION_NOT_FOUND", "This Climber isn't registered for this competition."));
    renderPage(); await ready(); fireEvent.click(await confirmRemoval());
    expect(await screen.findByText("This Climber isn't registered for this competition.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Climber removed from competition" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm removal" })).toBeNull();
  });
  it("cancels a stale read when a different Climber is selected", async () => {
    const pending = deferred<ManagedClimberRegistration>(); vi.mocked(getClimberDetails).mockReturnValueOnce(pending.promise).mockResolvedValue(sam);
    renderPage(); await waitFor(() => expect(getClimberDetails).toHaveBeenCalledOnce());
    const signal = vi.mocked(getClimberDetails).mock.calls[0][2]!;
    fireEvent.click(screen.getByRole("button", { name: "Select other climber" }));
    expect(await screen.findByRole("heading", { name: "Sam Boulderer" })).toBeTruthy(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(ada)); expect(screen.queryByRole("heading", { name: "Ada Climber" })).toBeNull();
  });
  it("ignores a late edit after moving to a different competition", async () => {
    const pending = deferred<ManagedClimberRegistration>(); vi.mocked(updateClimberDetails).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); selectDivision(); fireEvent.submit(form);
    const signal = vi.mocked(updateClimberDetails).mock.calls[0][3]!;
    vi.mocked(getManagedCompetition).mockResolvedValue({ ...competition, _id: otherCompetition, name: "Second event" });
    vi.mocked(getClimberDetails).mockResolvedValue(sam);
    fireEvent.click(screen.getByRole("button", { name: "Select other competition" }));
    expect(await screen.findByRole("heading", { name: "Sam Boulderer" })).toBeTruthy(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(updated)); expect(screen.queryByText('Division saved as "Open".')).toBeNull();
    expect(getClimberDetails).toHaveBeenLastCalledWith(otherCompetition, ada.climber!._id, expect.any(AbortSignal));
  });
  it("ignores late removal success after another Climber is selected", async () => {
    const pending = deferred<void>(); vi.mocked(removeClimberRegistration).mockReturnValue(pending.promise);
    renderPage(); await ready(); fireEvent.click(await confirmRemoval()); const signal = vi.mocked(removeClimberRegistration).mock.calls[0][2]!;
    vi.mocked(getClimberDetails).mockResolvedValue(sam); fireEvent.click(screen.getByRole("button", { name: "Select other climber" }));
    expect(await screen.findByRole("heading", { name: "Sam Boulderer" })).toBeTruthy(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(undefined)); expect(screen.queryByRole("heading", { name: "Climber removed from competition" })).toBeNull();
  });
});
