import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import {
  createManagedCompetition, fetchGymAdminDashboard, getManagedCompetition, listManagedCompetitions,
  type GymAdminSummary, type ManagedCompetitionDetails,
} from "../lib/gymAdminApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/gymAdminApi.ts", () => ({
  createManagedCompetition: vi.fn(), fetchGymAdminDashboard: vi.fn(),
  getManagedCompetition: vi.fn(), listManagedCompetitions: vi.fn(),
}));

const gym = { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym", location: "Toronto, Ontario" };
const otherGym = { _id: "507f1f77bcf86cd799439013", name: "South Gym", location: "Ottawa" };
const saved: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: gym._id, gym,
  name: "Brian Autumn Open", date: "2026-11-14", location: gym.location,
  description: "A local bouldering competition.", capacity: 80,
  status: "DRAFT", registrationStatus: "CLOSED", tools: [],
  scoring: { deductionPercent: 20, maxAttempts: 5, updatedAt: "2026-10-11T01:30:00Z" },
};
const summary: GymAdminSummary = { gyms: [gym], counts: { upcoming: 0, past: 0, drafts: 0 }, upcoming: [] };
function renderPage(path = "/gym-admin/competitions/new") {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
async function ready(path?: string) {
  const view = renderPage(path);
  await screen.findByRole("form", { name: "Competition information" });
  return view;
}
function fill() {
  fireEvent.change(screen.getByLabelText("Competition name"), { target: { value: "  Brian Autumn Open  " } });
  fireEvent.change(screen.getByLabelText("Event date"), { target: { value: saved.date } });
  fireEvent.change(screen.getByLabelText("Participant capacity"), { target: { value: "80" } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: " A local bouldering competition. " } });
}
function submit() { fireEvent.submit(screen.getByRole("form", { name: "Competition information" })); }
function role(value: "GYM_ADMIN" | "ADMIN" | "CLIMBER") {
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "brian-gym-admin", email: "gymadmin.test@example.com", role: value,
    session: { expiresIn: 3600, limitReached: false },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T01:30:00Z"));
  vi.mocked(fetchGymAdminDashboard).mockReset().mockResolvedValue(summary);
  vi.mocked(createManagedCompetition).mockReset().mockResolvedValue(saved);
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(saved);
  vi.mocked(listManagedCompetitions).mockReset().mockResolvedValue({ competitions: [saved], total: 1, page: 1, limit: 20 });
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "brian-gym-admin", role: "GYM_ADMIN", token: "test-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
  role("GYM_ADMIN");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("US-012 #48/#49 competition creation", () => {
  it("opens the dedicated form with its four fields and an automatically associated gym", async () => {
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Create competition" })).toBeTruthy();
    expect(screen.getByLabelText("Competition name")).toBeTruthy();
    expect(screen.getByLabelText("Event date")).toBeTruthy();
    expect(screen.getByLabelText(/^Description/)).toBeTruthy();
    expect(screen.getByLabelText("Participant capacity")).toBeTruthy();
    expect(screen.getByText(gym.name)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByLabelText("Event date").getAttribute("min")).toBe("2026-10-10");
    expect(screen.getByLabelText("Event date").getAttribute("max")).toBe("2028-10-10");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Competition name")));
    expect(document.title).toBe("Create Competition | TopSend");
    expect(getManagedCompetition).not.toHaveBeenCalled();
    expect(listManagedCompetitions).not.toHaveBeenCalled();
  });
  it("waits for authorized gym data before offering the form", async () => {
    vi.mocked(fetchGymAdminDashboard).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(await screen.findByText("Loading your assigned gyms…")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("shows required-field errors and focuses the first invalid field without submitting", async () => {
    await ready(); submit();
    expect(screen.getByText("Enter the competition name.")).toBeTruthy();
    expect(screen.getByText("Choose the event date.")).toBeTruthy();
    expect(screen.getByText("Enter the maximum number of participants, from 1 to 1000.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Competition name"));
    expect(screen.getByLabelText("Competition name").getAttribute("aria-invalid")).toBe("true");
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it.each(["2026-10-09", "2028-10-11"])("rejects out-of-range date %s before submission", async date => {
    await ready(); fill();
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: date } });
    submit(); expect(createManagedCompetition).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Event date").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Event date"));
  });
  it.each(["0", "1.5", "1001"])("rejects capacity %s before submission", async value => {
    await ready(); fill();
    fireEvent.change(screen.getByLabelText("Participant capacity"), { target: { value } });
    submit(); expect(createManagedCompetition).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the maximum number of participants, from 1 to 1000.")).toBeTruthy();
  });
  it("trims submitted text, sends a number, and leaves automatic gym/location defaults to the server", async () => {
    await ready(); fill(); submit();
    const panel = await screen.findByRole("region", { name: "Created competition" });
    expect(createManagedCompetition).toHaveBeenCalledWith({
      name: saved.name, date: saved.date, capacity: 80, description: saved.description, deductionPercent: 20, maxAttempts: 5,
    }, expect.any(AbortSignal));
    expect(within(panel).getByText(gym.location)).toBeTruthy();
    expect(within(panel).getByText("20% off for each failed attempt, up to 5 attempts")).toBeTruthy();
    expect(within(panel).getByText("Nov 14, 2026").getAttribute("datetime")).toBe(saved.date);
    expect(within(panel).getByText("Draft")).toBeTruthy();
    expect(within(panel).getByText("Closed")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Competition created" })));
    expect(screen.queryByRole("form")).toBeNull();
  });
  it("shows the gym's location without a field to change it, and leaves it to the server", async () => {
    await ready();
    expect(screen.queryByLabelText(/^Location/)).toBeNull();
    const location = screen.getByText(gym.location, { selector: "strong" });
    expect(location.previousElementSibling?.textContent).toBe("Location");
    expect(location.nextElementSibling?.textContent).toBe("Competitions use their gym's location. A System Administrator can change it.");
    fill(); submit();
    await screen.findByRole("region", { name: "Created competition" });
    expect(vi.mocked(createManagedCompetition).mock.calls[0][0]).not.toHaveProperty("location");
  });
  it("supports an optional empty description", async () => {
    await ready(); fill();
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "" } });
    submit();
    await screen.findByRole("region", { name: "Created competition" });
    expect(createManagedCompetition).toHaveBeenCalledWith({
      name: saved.name, date: saved.date, capacity: 80, deductionPercent: 20, maxAttempts: 5,
    }, expect.any(AbortSignal));
  });
  it("shows saved server values and opens the real competition details, then the refreshed list", async () => {
    vi.mocked(createManagedCompetition).mockResolvedValue({ ...saved, name: "Saved event name", capacity: 90 });
    await ready(); fill(); submit();
    const panel = await screen.findByRole("region", { name: "Created competition" });
    expect(within(panel).getByText("90")).toBeTruthy();
    expect(within(panel).getByText(/Saved event name was saved/)).toBeTruthy();
    const link = within(panel).getByRole("link", { name: "View competition" });
    expect(link.getAttribute("href")).toBe("/gym-admin/competitions/" + saved._id + "?gymId=" + gym._id);
    fireEvent.click(link);
    await screen.findByRole("region", { name: "Selected competition" });
    expect(getManagedCompetition).toHaveBeenCalledWith(saved._id, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("link", { name: "Back to competitions" }));
    expect(await screen.findByRole("link", { name: "View details for " + saved.name })).toBeTruthy();
    expect(listManagedCompetitions).toHaveBeenLastCalledWith({ period: "upcoming", gymId: gym._id, page: 1 }, expect.any(AbortSignal));
  });
  it("offers only assigned gyms, requires a choice, and submits the selected authorized gym", async () => {
    vi.mocked(fetchGymAdminDashboard).mockResolvedValue({ ...summary, gyms: [gym, otherGym] });
    await ready(); fill(); submit();
    expect(createManagedCompetition).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("Competition gym"));
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Choose your gym", gym.name, otherGym.name]);
    expect(screen.getByText("Choose the competition gym to see its location.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Competition gym"), { target: { value: otherGym._id } });
    expect(screen.getByText(otherGym.location, { selector: "strong" })).toBeTruthy();
    submit(); await screen.findByRole("region", { name: "Created competition" });
    expect(createManagedCompetition).toHaveBeenCalledWith(expect.objectContaining({ gymId: otherGym._id }), expect.any(AbortSignal));
  });
  it("uses an authorized dashboard gym hint without accepting a foreign URL gym", async () => {
    vi.mocked(fetchGymAdminDashboard).mockResolvedValue({ ...summary, gyms: [gym, otherGym] });
    const view = await ready("/gym-admin/competitions/new?gymId=" + otherGym._id);
    expect((screen.getByLabelText("Competition gym") as HTMLSelectElement).value).toBe(otherGym._id);
    view.unmount();
    await ready("/gym-admin/competitions/new?gymId=507f1f77bcf86cd799439099");
    expect((screen.getByLabelText("Competition gym") as HTMLSelectElement).value).toBe("");
    fill(); submit(); expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("preserves all input and displays server validation next to the affected field", async () => {
    vi.mocked(createManagedCompetition).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
      date: "Choose today or a later date.", capacity: "Capacity is invalid.", unknownField: "Do not render this.",
    }));
    await ready(); fill(); submit();
    expect(await screen.findByText("Capacity is invalid.")).toBeTruthy();
    expect(screen.getByText("Choose today or a later date.")).toBeTruthy();
    expect(screen.queryByText("Do not render this.")).toBeNull();
    expect((screen.getByLabelText("Competition name") as HTMLInputElement).value).toBe("  Brian Autumn Open  ");
    expect((screen.getByLabelText("Participant capacity") as HTMLInputElement).value).toBe("80");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Event date")));
    fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-11-15" } });
    expect(screen.queryByText("Choose today or a later date.")).toBeNull();
    expect(screen.getByText("Capacity is invalid.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Created competition" })).toBeNull();
  });
  it("shows duplicate feedback, preserves input, and lets a corrected name be submitted", async () => {
    const message = "Your gym already has a competition with this name on this date.";
    vi.mocked(createManagedCompetition).mockRejectedValueOnce(new ApiError(409, "COMPETITION_EXISTS", message, { name: message }));
    await ready(); fill(); submit();
    await waitFor(() => expect(screen.getByLabelText("Competition name").getAttribute("aria-invalid")).toBe("true"));
    expect(document.activeElement).toBe(screen.getByLabelText("Competition name"));
    expect(screen.getAllByText(message)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Competition name"), { target: { value: "Winter Open" } });
    submit(); await screen.findByRole("region", { name: "Created competition" });
    expect(createManagedCompetition).toHaveBeenCalledTimes(2);
  });
  it("prevents double submits and disables editing until the API answers", async () => {
    let resolve!: (value: ManagedCompetitionDetails) => void;
    vi.mocked(createManagedCompetition).mockImplementation(() => new Promise(done => { resolve = done; }));
    await ready(); fill(); submit(); submit();
    expect(createManagedCompetition).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Saving competition…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Competition name").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("aria-disabled")).toBe("true");
    await act(async () => resolve(saved));
    expect(await screen.findByRole("region", { name: "Created competition" })).toBeTruthy();
  });
  it.each([
    new ApiError(0, "NETWORK_ERROR", "Network unavailable."),
    new ApiError(0, "TIMEOUT", "Request timed out."),
    new ApiError(500, "INTERNAL_ERROR", "private database details"),
    new Error("private internal exception"),
  ])("handles an uncertain save safely without a success message or automatic retry", async error => {
    vi.mocked(createManagedCompetition).mockRejectedValue(error);
    await ready(); fill(); submit();
    expect(await screen.findByText("Couldn't confirm the save. Check your competition list before trying again.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Check competition list" })).toBeTruthy();
    expect(screen.queryByText(/private/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Created competition" })).toBeNull();
    expect((screen.getByLabelText("Participant capacity") as HTMLInputElement).value).toBe("80");
    expect(createManagedCompetition).toHaveBeenCalledOnce();
  });
  it("blocks further writes and hides the form if gym access is revoked during submission", async () => {
    vi.mocked(createManagedCompetition).mockRejectedValue(new ApiError(403, "NO_ASSIGNED_GYM", "Contact a System Administrator."));
    await ready(); fill(); submit();
    expect(await screen.findByRole("heading", { name: "Gym access unavailable" })).toBeTruthy();
    expect(screen.getByText("Contact a System Administrator.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByText(gym.name)).toBeNull();
  });
  it("shows missing gym access before any form or write is available", async () => {
    vi.mocked(fetchGymAdminDashboard).mockRejectedValue(new ApiError(403, "NO_ASSIGNED_GYM", "Contact a System Administrator."));
    renderPage();
    expect(await screen.findByText("Contact a System Administrator.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("handles an empty assigned-gym response without offering an unrestricted gym field", async () => {
    vi.mocked(fetchGymAdminDashboard).mockResolvedValue({ ...summary, gyms: [] });
    renderPage();
    expect(await screen.findByRole("heading", { name: "No active gym assigned" })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("retries a failed gym load and hides unexpected technical details", async () => {
    vi.mocked(fetchGymAdminDashboard).mockRejectedValueOnce(new Error("private connection detail"));
    renderPage();
    expect(await screen.findByText("Couldn't load your assigned gyms. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("form")).toBeTruthy();
    expect(fetchGymAdminDashboard).toHaveBeenCalledTimes(2);
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s before gym reads and competition writes", async value => {
    role(value); renderPage();
    expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(fetchGymAdminDashboard).not.toHaveBeenCalled();
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("redirects a visitor to login before exposing the form or loading private data", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test-csrf", sessionCookie: false });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(fetchGymAdminDashboard).not.toHaveBeenCalled();
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("cancels back to the dashboard with the existing filters, without creating anything", async () => {
    await ready("/gym-admin/competitions/new?period=past&gymId=" + gym._id + "&page=2");
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/dashboard?period=past&gymId=" + gym._id + "&page=2");
    fireEvent.click(screen.getByRole("link", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Gym admin dashboard" })).toBeTruthy();
    expect(createManagedCompetition).not.toHaveBeenCalled();
  });
  it("can start another competition after a confirmed successful save", async () => {
    await ready(); fill(); submit();
    fireEvent.click(await screen.findByRole("button", { name: "Create another competition" }));
    expect((screen.getByLabelText("Competition name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Participant capacity") as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText("Competition name"));
    expect(createManagedCompetition).toHaveBeenCalledOnce();
  });
  it("aborts an unfinished assigned-gym read when leaving", async () => {
    vi.mocked(fetchGymAdminDashboard).mockImplementation(() => new Promise(() => {}));
    const view = renderPage(); await screen.findByText("Loading your assigned gyms…");
    const signal = vi.mocked(fetchGymAdminDashboard).mock.calls[0][0];
    view.unmount(); expect(signal?.aborted).toBe(true);
  });
  it("aborts a pending write and ignores its late answer after leaving", async () => {
    let resolve!: (value: ManagedCompetitionDetails) => void;
    vi.mocked(createManagedCompetition).mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = await ready(); fill(); submit();
    const signal = vi.mocked(createManagedCompetition).mock.calls[0][1];
    view.unmount(); expect(signal?.aborted).toBe(true);
    await act(async () => resolve(saved));
    expect(screen.queryByRole("region", { name: "Created competition" })).toBeNull();
  });
});

describe("US-012 and US-018 scoring set when creating a competition", () => {
  const deduction = () => screen.getByLabelText("Deduction per failed attempt (%)") as HTMLInputElement;
  const attempts = () => screen.getByLabelText("Maximum attempts per problem") as HTMLInputElement;

  it("starts at 20% and 5 attempts, sends the chosen settings, and shows what was saved", async () => {
    vi.mocked(createManagedCompetition).mockResolvedValue({ ...saved, scoring: { deductionPercent: 25, maxAttempts: 4 } });
    await ready();
    expect(screen.getByRole("group", { name: "Scoring" })).toBeTruthy();
    expect(deduction().value).toBe("20"); expect(attempts().value).toBe("5");
    expect([deduction().min, deduction().max, deduction().step, attempts().min, attempts().max, attempts().step]).toEqual(["0", "99", "1", "1", "20", "1"]);
    expect(deduction().getAttribute("aria-describedby")).toBe("competition-deductionPercent-help");
    fill(); fireEvent.change(deduction(), { target: { value: "25" } }); fireEvent.change(attempts(), { target: { value: "4" } }); submit();
    const panel = await screen.findByRole("region", { name: "Created competition" });
    expect(createManagedCompetition).toHaveBeenCalledWith(expect.objectContaining({ deductionPercent: 25, maxAttempts: 4 }), expect.any(AbortSignal));
    expect(within(panel).getByText("Scoring format", { selector: "dt" }).nextElementSibling?.textContent).toBe("25% off for each failed attempt, up to 4 attempts");
  });
  it.each(["", "-1", "2.5", "100"])("rejects a deduction of '%s' before submission", async value => {
    await ready(); fill(); fireEvent.change(deduction(), { target: { value } }); submit();
    expect(createManagedCompetition).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a whole-number percentage from 0 to 99.")).toBeTruthy();
    expect(deduction().getAttribute("aria-invalid")).toBe("true");
    expect(deduction().getAttribute("aria-describedby")).toBe("competition-deductionPercent-help competition-deductionPercent-error");
    expect(document.activeElement).toBe(deduction());
  });
  it.each(["", "0", "21", "1.5"])("rejects '%s' attempts before submission", async value => {
    await ready(); fill(); fireEvent.change(attempts(), { target: { value } }); submit();
    expect(createManagedCompetition).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a whole number of attempts from 1 to 20.")).toBeTruthy();
    expect(document.activeElement).toBe(attempts());
  });
  it("explains the largest deduction so a top on the last attempt still scores", async () => {
    await ready(); fill(); fireEvent.change(deduction(), { target: { value: "30" } }); submit();
    expect(createManagedCompetition).not.toHaveBeenCalled();
    expect(screen.getByText("With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores.")).toBeTruthy();
    expect(document.activeElement).toBe(deduction());
    fireEvent.change(attempts(), { target: { value: "3" } });
    expect(screen.queryByText(/the deduction can be at most/)).toBeNull();
    submit(); await screen.findByRole("region", { name: "Created competition" });
    expect(createManagedCompetition).toHaveBeenCalledWith(expect.objectContaining({ deductionPercent: 30, maxAttempts: 3 }), expect.any(AbortSignal));
  });
  it("shows the server's scoring messages next to their fields", async () => {
    const message = "With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores.";
    vi.mocked(createManagedCompetition).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", { deductionPercent: message }));
    await ready(); fill(); submit();
    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(deduction()));
    expect(deduction().value).toBe("20");
  });
  it("starts another competition at 20% and 5 attempts again", async () => {
    await ready(); fill(); fireEvent.change(deduction(), { target: { value: "10" } }); fireEvent.change(attempts(), { target: { value: "8" } }); submit();
    fireEvent.click(await screen.findByRole("button", { name: "Create another competition" }));
    expect(deduction().value).toBe("20"); expect(attempts().value).toBe("5");
  });
});
