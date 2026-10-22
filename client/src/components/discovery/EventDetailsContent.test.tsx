import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import type { DiscoveredEventDetails } from "../../lib/discoveryApi.ts";
import { eventDivisionChoices, prepareEventRegistration, type EventRegistrationSetup } from "../../lib/eventRegistration.ts";
import type { EventRegistrationResult } from "../../lib/eventRegistrationApi.ts";
import EventDetailsContent, { type RegisterForEvent } from "./EventDetailsContent.tsx";

const event: DiscoveredEventDetails = {
  _id: "507f1f77bcf86cd799439011", name: "Autumn Bouldering Open", description: "Climb with your community.\nBring your own climbing shoes.",
  gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" }, date: "2026-11-14", location: "Toronto, Ontario",
  registrationStatus: "OPEN", capacity: 80, spacesLeft: 16, full: false, coordinates: null, upcoming: true, registrationAvailable: true,
  divisions: [{ _id: "open", name: "Open division" }, { _id: "youth", name: "Youth division" }, { _id: "limited", name: "Limited division" }],
  scoringFormat: { format: "TOPS", label: "Tops and zones" }, myRegistration: null,
};
const setup: EventRegistrationSetup = { ready: true, timeLabel: "10:00 a.m. (Toronto time)", divisions: [
  { divisionId: "open", requirements: ["All abilities", "Host's published requirements"], eligible: true, available: true },
  { divisionId: "youth", requirements: ["Youth category"], eligible: false, available: true, reason: "Your account is not eligible for this division." },
  { divisionId: "limited", requirements: [], eligible: true, available: false, reason: "No division spaces remain." },
] };
const result: EventRegistrationResult = { registrationId: "registration-one", competitionId: event._id, divisionId: "open", status: "CONFIRMED" };
const register = vi.fn<RegisterForEvent>();
function view(data = event, options = setup, extra = {}) { return <EventDetailsContent event={data} setup={options} climberId="signed-in-climber" register={register} {...extra} />; }
function form() { return screen.getByRole("form", { name: "Competition registration" }); }
function choose() { fireEvent.click(screen.getByRole("radio", { name: "Open division" })); }
function fact(label: string) { return within(screen.getByRole("region", { name: "Competition event details" })).getByText(label, { selector: "dt" }).nextElementSibling?.textContent; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { register.mockReset().mockResolvedValue(result); });
afterEach(cleanup);

describe("US-028 event layout and division registration (isolated UI fixtures)", () => {
  it("shows event information, server-provided time, capacity and requirements", () => {
    render(view()); expect(screen.getByRole("heading", { name: event.name })).toBeTruthy(); expect(screen.getByText(event.gym!.name)).toBeTruthy();
    expect(fact("Date")).toBe("Nov 14, 2026"); expect(fact("Time")).toBe(setup.timeLabel); expect(fact("Location")).toBe(event.location);
    expect(fact("Capacity")).toBe("80"); expect(fact("Spaces left")).toBe("16"); expect(fact("Registration")).toBe("Open");
    expect(screen.getByText(/Bring your own climbing shoes/)).toBeTruthy(); expect(screen.getByText("All abilities, Host's published requirements")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });
  it("uses the backend's event-membership eligibility without inferring age rules or an event time", () => {
    render(view(event, prepareEventRegistration(event))); expect(fact("Time")).toBe("To be announced");
    expect(screen.getAllByRole("radio").every(input => !input.matches(":disabled"))).toBe(true);
    expect(screen.getAllByText("No additional eligibility requirements.")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Youth division" }).matches(":disabled")).toBe(false);
  });
  it("does not enable registration when eligibility is explicitly unknown", () => {
    const unknown = { ...setup, ready: false, timeLabel: null, divisions: setup.divisions.map(choice => ({ ...choice, requirements: null, eligible: null, available: null, reason: undefined })) };
    render(view(event, unknown)); expect(fact("Time")).toBe("To be announced");
    expect(screen.getByText("Registration is not available for this event yet.")).toBeTruthy();
    expect(screen.getAllByText("Eligibility details are not available yet.")).toHaveLength(3);
    expect(screen.getAllByRole("radio").every(input => input.matches(":disabled"))).toBe(true);
    fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
  });
  it("shows zero spaces as full and blocks even a programmatic submission", () => {
    render(view({ ...event, spacesLeft: 0, full: true, registrationAvailable: false })); expect(fact("Spaces left")).toBe("0"); expect(fact("Registration")).toBe("Full");
    expect((screen.getByRole("button", { name: "Register for competition" }) as HTMLButtonElement).disabled).toBe(true); fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
  });
  it("blocks closed and past events without treating them as open", () => {
    const output = render(view({ ...event, registrationStatus: "CLOSED" })); expect(fact("Registration")).toBe("Closed"); fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
    output.rerender(view({ ...event, upcoming: false })); expect(fact("Registration")).toBe("Closed"); expect(screen.getByText("This competition has already taken place.")).toBeTruthy();
  });
  it("shows no announced divisions and disables registration", () => {
    render(view({ ...event, divisions: [] })); expect(screen.getByText("No divisions have been announced yet.")).toBeTruthy(); expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
  });
  it("displays unavailable and ineligible divisions without allowing either to be selected", () => {
    render(view()); expect((screen.getByRole("radio", { name: "Youth division" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "Limited division" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Your account is not eligible for this division.")).toBeTruthy(); expect(screen.getByText("No division spaces remain.")).toBeTruthy();
  });
  it("does not display or select division metadata from another competition", () => {
    const choices = eventDivisionChoices(event, { ...setup, divisions: [{ divisionId: "foreign", requirements: ["Private other-event requirement"], eligible: true, available: true }] });
    expect(choices).toHaveLength(3); expect(choices.every(choice => choice.eligible === null)).toBe(true);
    render(view(event, { ...setup, divisions: [{ divisionId: "foreign", requirements: ["Private other-event requirement"], eligible: true, available: true }] }));
    expect(screen.queryByText("Private other-event requirement")).toBeNull(); fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
  });
  it("requires a division and associates the validation message with the group", async () => {
    render(view()); fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
    expect(screen.getByText("Choose an eligible division to continue.")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Choose a division" }).getAttribute("aria-describedby")).toBe("division-selection-error");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Open division" })));
  });
  it("submits the selected event/division and session identity, then waits for confirmation", async () => {
    const onRegistered = vi.fn();
    const pending = deferred<EventRegistrationResult>(); register.mockReturnValue(pending.promise); const output = render(view(event, setup, { onRegistered })); choose(); fireEvent.submit(form());
    expect(register).toHaveBeenCalledWith(event._id, { climberId: "signed-in-climber", divisionId: "open" }, expect.any(AbortSignal));
    expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull(); expect(onRegistered).not.toHaveBeenCalled();
    await act(async () => pending.resolve(result)); expect(await screen.findByRole("heading", { name: "Registration confirmed" })).toBeTruthy();
    expect(screen.getByText("Division: Open division")).toBeTruthy(); expect(screen.queryByRole("form")).toBeNull(); expect(onRegistered).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Refresh event details/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Registration confirmed" })));
    output.rerender(view({ ...event, spacesLeft: 0, full: true, registrationAvailable: false, myRegistration: { status: "CONFIRMED", registeredAt: "2026-10-19T03:00:00Z", division: event.divisions[0] } }, setup, { onRegistered }));
    expect(fact("Spaces left")).toBe("0"); expect(screen.getByText("Registration full")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Registration confirmed" })).toBe(document.activeElement);
  });
  it("prevents repeated submissions and changes while the request is processing", async () => {
    const pending = deferred<EventRegistrationResult>(); register.mockReturnValue(pending.promise); const onBusy = vi.fn(); render(view(event, setup, { onBusy })); choose(); const originalForm = form();
    fireEvent.submit(originalForm); fireEvent.submit(originalForm); expect(register).toHaveBeenCalledOnce(); expect(screen.getByRole("radio", { name: "Open division" }).matches(":disabled")).toBe(true);
    expect((screen.getByRole("button", { name: "Registering…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve(result)); await screen.findByRole("heading", { name: "Registration confirmed" }); expect(onBusy).toHaveBeenCalledWith(true); expect(onBusy).toHaveBeenLastCalledWith(false);
  });
  it("rejects a selection that becomes ineligible before submission", () => {
    const output = render(view()); choose(); output.rerender(view(event, { ...setup, divisions: setup.divisions.map(choice => ({ ...choice, eligible: false })) }));
    fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
  });
  it.each(["CONFIRMED", "PENDING", "WAITLIST"] as const)("shows an existing %s registration without another submit action", status => {
    render(view({ ...event, myRegistration: { status, registeredAt: "2026-10-18T12:00:00Z", division: event.divisions[0] } }));
    expect(screen.getByRole("heading", { name: { CONFIRMED: "Confirmed", PENDING: "Pending", WAITLIST: "Waitlisted" }[status] })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByRole("button", { name: /Register for/ })).toBeNull(); expect(register).not.toHaveBeenCalled();
  });
  it.each(["PENDING", "WAITLIST"] as const)("does not label a returned %s registration as confirmed", async status => {
    register.mockResolvedValue({ ...result, status }); render(view()); choose(); fireEvent.submit(form());
    expect(await screen.findByRole("heading", { name: status === "PENDING" ? "Registration submitted" : "Registration waitlisted" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull();
  });
  it("shows server validation beside the division and keeps the selection for correction", async () => {
    register.mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Check your division.", { divisionId: "This division is no longer available.", internal: "private database" }));
    render(view()); choose(); fireEvent.submit(form()); expect(await screen.findByText("This division is no longer available.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Open division" }) as HTMLInputElement).checked).toBe(true); expect(screen.queryByText("private database")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull();
  });
  it.each([0, 503])("requires refresh after an unconfirmed save (%s), retaining data without optimistic success", async status => {
    register.mockRejectedValueOnce(new ApiError(status, "REQUEST_FAILED", "private server details")); render(view()); choose(); fireEvent.submit(form());
    expect(await screen.findByText("Couldn't confirm your registration. Refresh event details before trying again.")).toBeTruthy();
    expect(screen.queryByText("private server details")).toBeNull(); expect(fact("Spaces left")).toBe("16"); expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull();
    fireEvent.submit(form()); expect(register).toHaveBeenCalledOnce(); expect((screen.getByRole("button", { name: "Register for competition" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["COMPETITION_FULL", "REGISTRATION_CLOSED", "COMPETITION_FINISHED", "ALREADY_REGISTERED"])("requires fresh event details after a %s conflict", async code => {
    register.mockRejectedValueOnce(new ApiError(409, code, "Event availability has changed.")); render(view()); choose(); fireEvent.submit(form());
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.getByText("Event availability has changed.")).toBeTruthy();
    fireEvent.submit(form()); expect(register).toHaveBeenCalledOnce(); expect(screen.getByRole("button", { name: "Register for competition" }).matches(":disabled")).toBe(true);
  });
  it("shows the safe unavailable message when transaction support is missing", async () => {
    register.mockRejectedValueOnce(new ApiError(503, "REGISTRATION_UNAVAILABLE", "private database details")); render(view()); choose(); fireEvent.submit(form());
    expect(await screen.findByText("Registration is temporarily unavailable. Please try again later.")).toBeTruthy(); expect(screen.queryByText("private database details")).toBeNull();
    expect(screen.getByRole("button", { name: "Register for competition" }).matches(":disabled")).toBe(true);
  });
  it("does not confirm an API response for another event", async () => {
    register.mockResolvedValueOnce({ ...result, competitionId: "foreign" }); render(view()); choose(); fireEvent.submit(form());
    expect(await screen.findByText(/Couldn't confirm your registration/)).toBeTruthy(); expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull();
  });
  it.each([401, 403, 404])("passes lost access or an unavailable event to the owning page (%s)", async status => {
    const onDenied = vi.fn(); const error = new ApiError(status, "ACCESS_DENIED", "Sign in again."); register.mockRejectedValueOnce(error);
    render(view(event, setup, { onDenied })); choose(); fireEvent.submit(form()); await waitFor(() => expect(onDenied).toHaveBeenCalledWith(error));
  });
  it("aborts a write when the selected event is unmounted and ignores late success", async () => {
    const pending = deferred<EventRegistrationResult>(); register.mockReturnValueOnce(pending.promise); const output = render(view()); choose(); fireEvent.submit(form());
    const signal = register.mock.calls[0][2]; output.unmount(); await act(async () => pending.resolve(result)); expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("heading", { name: "Registration confirmed" })).toBeNull();
  });
  it("uses readable placeholders rather than a made-up zero for unavailable counts", () => {
    render(view({ ...event, capacity: Number.NaN, spacesLeft: Number.NaN, description: "", scoringFormat: null, location: "" }));
    expect(fact("Capacity")).toBe("Not available"); expect(fact("Spaces left")).toBe("Not available"); expect(fact("Scoring format")).toBe("Not configured");
    expect(screen.getByText("No event description has been added yet.")).toBeTruthy(); fireEvent.submit(form()); expect(register).not.toHaveBeenCalled();
  });
});
