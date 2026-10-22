import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CompetitionDetailsForm from "./CompetitionDetailsForm.tsx";
import { updateManagedCompetition, type ManagedCompetitionDetails } from "../../lib/gymAdminApi.ts";
import { ApiError } from "../../lib/apiClient.ts";
vi.mock("../../lib/gymAdminApi.ts", () => ({ updateManagedCompetition: vi.fn() }));
const record: ManagedCompetitionDetails = { _id: "selected-event", gymId: "assigned-gym", gym: { _id: "assigned-gym", name: "North Gym" }, name: "Autumn Open", date: "2020-10-10", location: "Toronto", description: "Local event", capacity: 80, status: "DRAFT", registrationStatus: "CLOSED", registeredClimberCount: 12, tools: [] };
const onSaved = vi.fn(), onDenied = vi.fn(), onBusy = vi.fn();
function page(c = record) { return render(<CompetitionDetailsForm competition={c} onSaved={onSaved} onDenied={onDenied} onBusy={onBusy} />); }
function change(label: string | RegExp, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function save() { fireEvent.submit(screen.getByRole("form", { name: "Edit competition details" })); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(updateManagedCompetition).mockReset().mockResolvedValue(record); });
afterEach(cleanup);
describe("US-013 details and registration count", () => {
  it.each([0, 12])("shows the server's confirmed count %i", count => { page({ ...record, registeredClimberCount: count }); expect(screen.getByText(String(count))).toBeTruthy(); });
  it("does not fabricate a zero when the server count is missing", () => { page({ ...record, registeredClimberCount: undefined }); expect(screen.getByText("Not available")).toBeTruthy(); });
  it("sends only changed permitted fields for the selected ID, accepts past dates, and updates saved values/count", async () => {
    const updated = { ...record, name: "Updated Open", capacity: 90, registeredClimberCount: 13, registrationStatus: "OPEN" as const };
    vi.mocked(updateManagedCompetition).mockResolvedValue(updated); page();
    change("Competition name", " Updated Open "); change("Maximum participants", "90"); change("Registration status", "OPEN"); save();
    await waitFor(() => expect(updateManagedCompetition).toHaveBeenCalledWith(record._id, { name: "Updated Open", capacity: 90, registrationStatus: "OPEN" }, expect.any(AbortSignal)));
    expect(await screen.findByText("Competition details saved.")).toBeTruthy(); expect(screen.getByText("13")).toBeTruthy(); expect(onSaved).toHaveBeenCalledWith(updated);
    expect((screen.getByLabelText("Competition name") as HTMLInputElement).value).toBe("Updated Open");
  });
  it.each(["", "0", "12.5", "1001", "11"])("rejects invalid or insufficient capacity %s without a write", async value => {
    page(); change("Maximum participants", value); save(); expect(await screen.findByText(/whole number|cannot be less/)).toBeTruthy(); expect(updateManagedCompetition).not.toHaveBeenCalled();
  });
  it("validates required whitespace and focuses the first invalid field", () => { page(); change("Competition name", "   "); save(); expect(screen.getByText("Enter the competition name.")).toBeTruthy(); expect(document.activeElement).toBe(screen.getByLabelText("Competition name")); });
  it("shows the location without a field to change it", () => {
    page();
    expect(screen.queryByLabelText("Location")).toBeNull();
    const location = screen.getByText(record.location, { selector: "strong" });
    expect(location.previousElementSibling?.textContent).toBe("Location");
    expect(location.nextElementSibling?.textContent).toBe("Competitions use their gym's location. A System Administrator can change it.");
  });
  it("discards edits back to the last server-confirmed values", () => { page(); change(/Description/, "Edited"); fireEvent.click(screen.getByRole("button", { name: "Discard changes" })); expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe(record.description); save(); expect(updateManagedCompetition).not.toHaveBeenCalled(); });
  it("prevents repeated submits while a save is pending and aborts on leaving", () => { vi.mocked(updateManagedCompetition).mockImplementation(() => new Promise(() => {})); const view = page(); change(/Description/, "Updated event"); save(); save(); expect(updateManagedCompetition).toHaveBeenCalledOnce(); const signal = vi.mocked(updateManagedCompetition).mock.calls[0][2]; view.unmount(); expect(signal?.aborted).toBe(true); });
  it("preserves input, displays current server validation feedback, and focuses the field", async () => { vi.mocked(updateManagedCompetition).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", { capacity: "Capacity cannot be less than the 15 confirmed registrations." })); page(); change("Maximum participants", "14"); save(); expect(await screen.findByText(/15 confirmed registrations/)).toBeTruthy(); expect((screen.getByLabelText("Maximum participants") as HTMLInputElement).value).toBe("14"); await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Maximum participants"))); });
  it("explains that registration needs a division, links to Divisions and climbers, and clears it when registration stays closed", async () => {
    const message = "Add a division before opening registration. Climbers choose one when they register.";
    vi.mocked(updateManagedCompetition).mockRejectedValue(new ApiError(409, "DIVISION_REQUIRED", message, { registrationStatus: message }));
    render(<MemoryRouter><CompetitionDetailsForm competition={record} divisionsPath="/gym-admin/competitions/selected-event/divisions?period=all" onSaved={onSaved} onDenied={onDenied} onBusy={onBusy} /></MemoryRouter>);
    change("Registration status", "OPEN"); save();
    const select = screen.getByLabelText("Registration status");
    expect((await screen.findByText(message)).id).toBe("edit-registrationStatus-error");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.getAttribute("aria-describedby")).toBe("edit-registrationStatus-error");
    await waitFor(() => expect(document.activeElement).toBe(select));
    expect(screen.getByRole("link", { name: "Add a division in Divisions and climbers" }).getAttribute("href")).toBe("/gym-admin/competitions/selected-event/divisions?period=all");
    expect(screen.queryByRole("alert")).toBeNull();
    change("Registration status", "CLOSED");
    expect(screen.queryByText(message)).toBeNull();
    expect(screen.queryByRole("link", { name: "Add a division in Divisions and climbers" })).toBeNull();
  });
  it("does not claim success or expose a technical exception after an uncertain save", async () => { vi.mocked(updateManagedCompetition).mockRejectedValue(new Error("internal database password")); page(); change(/Description/, "Updated event"); save(); expect(await screen.findByText(/Couldn't confirm the save/)).toBeTruthy(); expect(screen.queryByText(/internal database password/)).toBeNull(); expect(onSaved).not.toHaveBeenCalled(); });
  it.each([403, 404])("passes access rejection %i to the page to remove private data", async status => { const error = new ApiError(status, "DENIED", "Unavailable"); vi.mocked(updateManagedCompetition).mockRejectedValue(error); page(); change(/Description/, "Updated event"); save(); await waitFor(() => expect(onDenied).toHaveBeenCalledWith(error)); });
  it("ignores a late successful response after leaving the selected competition", async () => { let resolve!: (c: ManagedCompetitionDetails) => void; vi.mocked(updateManagedCompetition).mockImplementation(() => new Promise(done => { resolve = done; })); const view = page(); change(/Description/, "Updated event"); save(); view.unmount(); await act(async () => resolve(record)); expect(onSaved).not.toHaveBeenCalled(); });
});

describe("US-013 dates and publishing", () => {
  function daysFromToday(days: number) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  it.each([
    ["yesterday", -1, "Choose today or a later date."],
    ["more than two years ahead", 3 * 366, "Choose a date within 2 years."],
  ])("refuses to move the competition to %s", async (_, days, message) => {
    page({ ...record, date: daysFromToday(10) }); change("Date", daysFromToday(days)); save();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(updateManagedCompetition).not.toHaveBeenCalled();
  });
  it("lets a past competition keep its date while other details change", async () => {
    page(); change(/Description/, "Updated event"); save();
    await waitFor(() => expect(updateManagedCompetition).toHaveBeenCalledWith(record._id, { description: "Updated event" }, expect.any(AbortSignal)));
  });
  it("tells the Gym Admin that opening registration publishes a draft", () => {
    page();
    expect(screen.getByText("Opening registration publishes this draft, so climbers can find it.")).toBeTruthy();
  });
  it("shows the published status the server returns after registration opens", async () => {
    vi.mocked(updateManagedCompetition).mockResolvedValue({ ...record, status: "PUBLISHED", registrationStatus: "OPEN" });
    page(); change("Registration status", "OPEN"); save();
    expect(await screen.findByText("Published")).toBeTruthy();
    expect(screen.getByText("Closing registration stops new registrations. The competition stays published.")).toBeTruthy();
  });
});
