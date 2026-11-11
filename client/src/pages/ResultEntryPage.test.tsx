import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getOfficialResult, getResultOptions, recordOfficialAttempt, saveOfficialResult, type ResultEntry, type ResultOptions } from "../lib/resultsApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";
import { liveUpdates } from "../test/liveUpdates.ts";
import { emptyResultEntry, resultOptions, savedResult, RESULT_COMPETITION as competitionId, RESULT_CLIMBER as climberId, RESULT_ROUTE as routeId, RESULT_OTHER_CLIMBER as otherClimberId } from "../test/resultEntryFixtures.ts";

vi.mock("../lib/routeAssistantApi.ts", async original => ({ ...await original<typeof import("../lib/routeAssistantApi.ts")>(), getRouteAssistant: vi.fn(() => new Promise(() => {})) }));
vi.mock("../lib/resultsApi.ts", () => ({ getResultOptions: vi.fn(), getOfficialResult: vi.fn(), saveOfficialResult: vi.fn(), recordOfficialAttempt: vi.fn() }));
const base = `/gym-admin/competitions/${competitionId}/results`;
const selected = `${base}?climberId=${climberId}&routeId=${routeId}&period=past&page=2`;
const ids = { competitionId, climberId, routeId };
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`${base}?climberId=${otherClimberId}&routeId=${routeId}`)}>Choose another pair</button>;
}
function renderPage(url = selected) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function ready() { await screen.findByRole("heading", { name: "Saved official result" }); }
function totals(attempts: string, sent = false) {
  fireEvent.click(screen.getByLabelText("Enter or correct totals"));
  fireEvent.change(screen.getByLabelText("Total attempts"), { target: { value: attempts } });
  const checkbox = screen.getByLabelText("The Climber sent this problem") as HTMLInputElement;
  if (checkbox.checked !== sent) fireEvent.click(checkbox);
}
function review() { fireEvent.click(screen.getByRole("button", { name: "Review result" })); }
function confirm() { fireEvent.click(screen.getByRole("button", { name: "Confirm and save" })); }
const changed = [{ topic: "results", competitionId }];
function failed(attempts = 1): ResultEntry { return { ...savedResult({ attempts, sent: false, sends: 0, flash: false, officialScore: 0 }), attemptsLeft: 5 - attempts }; }
let live: ReturnType<typeof liveUpdates>;
beforeEach(() => { live = liveUpdates();
  vi.mocked(getResultOptions).mockReset().mockResolvedValue(structuredClone(resultOptions));
  vi.mocked(getOfficialResult).mockReset().mockResolvedValue(structuredClone(emptyResultEntry));
  vi.mocked(saveOfficialResult).mockReset().mockResolvedValue(savedResult());
  vi.mocked(recordOfficialAttempt).mockReset().mockResolvedValue(failed());
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AC-022 the AI Route Assistant's chatbot on Result entry", () => {
  it("opens for the competition whose results are being recorded", async () => {
    renderPage(); await ready();

    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    const chat = within(screen.getByRole("dialog", { name: "AI Route Assistant" }));
    expect(chat.getByText(`${resultOptions.competition.name}, Result entry`)).toBeTruthy();
    expect(chat.getByText(/Ask how the problems are going as results come in\./)).toBeTruthy();
  });

  it("isn't there when result entry couldn't be loaded", async () => {
    vi.mocked(getResultOptions).mockRejectedValue(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."));
    renderPage(); await screen.findByRole("heading", { name: "Result entry unavailable" });

    expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
  });
});

describe("US-019 #167/#168 official result selection and input", () => {
  it("waits for metadata and both selections before reading a saved result", async () => {
    const pending = deferred<ResultOptions>(); vi.mocked(getResultOptions).mockReturnValueOnce(pending.promise);
    renderPage(base); await screen.findByText("Loading result entry…"); expect(getOfficialResult).not.toHaveBeenCalled();
    await act(async () => pending.resolve(resultOptions));
    const climber = await screen.findByLabelText("Registered Climber"), route = screen.getByLabelText("Boulder problem");
    expect(within(climber).getByRole("option", { name: /Ada Climber.*Open/ })).toBeTruthy();
    expect(within(route).getByRole("option", { name: /Yellow Slab.*V2.*100 points/ })).toBeTruthy();
    fireEvent.change(climber, { target: { value: climberId } }); expect(getOfficialResult).not.toHaveBeenCalled();
    fireEvent.change(route, { target: { value: routeId } }); await ready();
    expect(getOfficialResult).toHaveBeenCalledWith(ids, expect.any(AbortSignal));
    const summary = screen.getByLabelText("Selected Climber and boulder problem");
    expect(within(summary).getByText("Ada Climber")).toBeTruthy(); expect(within(summary).getByText("Open")).toBeTruthy();
    expect(screen.getByText(/No result has been recorded/)).toBeTruthy(); expect(screen.getAllByText("Not recorded").length).toBe(4);
  });
  it("preserves competition filters on its return link", async () => {
    renderPage(); await ready(); expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toBe(`/gym-admin/competitions/${competitionId}?period=past&page=2`);
  });
  it("handles an empty competition without inventing registrations or routes", async () => {
    vi.mocked(getResultOptions).mockResolvedValue({ ...resultOptions, climbers: [], routes: [], canRecord: { allowed: false, reasons: ["Add boulder problems and confirmed Climbers."] } });
    renderPage(base); await screen.findByText("No Climbers have a confirmed registration for this competition.");
    expect(screen.getByLabelText("Registered Climber").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("No boulder problems have been added to this competition.")).toBeTruthy(); expect(getOfficialResult).not.toHaveBeenCalled();
  });
  it("explains a stale selection without requesting another Climber's result", async () => {
    renderPage(selected.replace(climberId, "unknown-climber")); await screen.findByText(/The selected Climber is unavailable/);
    expect(getOfficialResult).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Record send" })).toBeNull();
  });
  it("offers a safe retry when the entry couldn't be loaded", async () => {
    vi.mocked(getResultOptions).mockRejectedValueOnce(new Error("private database details"));
    renderPage(); await screen.findByText("Couldn't load result entry. Please try again."); expect(screen.queryByText(/private database/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready(); expect(screen.queryByRole("button", { name: /Refresh/ })).toBeNull();
  });
  it("follows the competition when it changes, keeping the entry in view meanwhile", async () => {
    renderPage(); await ready(); const pending = deferred<ResultOptions>(); vi.mocked(getResultOptions).mockReturnValueOnce(pending.promise);
    await live.announce([{ topic: "competitions", competitionId }]);
    expect(screen.getByRole("heading", { name: "Local Boulder Open" })).toBeTruthy(); expect(screen.queryByText("Loading result entry…")).toBeNull();
    expect(screen.queryByText("Loading selected result…")).toBeNull();
    await act(async () => pending.resolve({ ...resultOptions, competition: { ...resultOptions.competition, name: "Local Boulder Classic" } }));
    expect(screen.getByRole("heading", { name: "Local Boulder Classic" })).toBeTruthy(); expect(getOfficialResult).toHaveBeenCalledTimes(2);
  });
  it("follows a result recorded somewhere else", async () => {
    renderPage(); await ready(); expect(screen.getByText(/No result has been recorded/)).toBeTruthy();
    vi.mocked(getOfficialResult).mockResolvedValue(failed(2)); await live.announce(changed);
    await waitFor(() => expect(screen.getByText("Not sent")).toBeTruthy()); expect(screen.queryByText(/No result has been recorded/)).toBeNull();
    expect(screen.queryByText("Loading selected result…")).toBeNull(); expect(getOfficialResult).toHaveBeenLastCalledWith(ids, expect.any(AbortSignal));
  });
  it("ignores another competition's results", async () => {
    renderPage(); await ready(); await live.announce([{ topic: "results", competitionId: "507f1f77bcf86cd799439099" }]);
    expect(getResultOptions).toHaveBeenCalledOnce(); expect(getOfficialResult).toHaveBeenCalledOnce();
  });
  it("doesn't reload over totals that aren't saved, and reloads once they're back to the saved result", async () => {
    renderPage(); await ready(); totals("2"); await live.announce(changed);
    expect(getOfficialResult).toHaveBeenCalledOnce(); expect((screen.getByLabelText("Total attempts") as HTMLInputElement).value).toBe("2");
    fireEvent.change(screen.getByLabelText("Total attempts"), { target: { value: "0" } });
    await waitFor(() => expect(getOfficialResult).toHaveBeenCalledTimes(2)); expect(getResultOptions).toHaveBeenCalledTimes(2);
  });
  it("doesn't reload under a result that waits for confirmation", async () => {
    renderPage(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Record send" })); await live.announce(changed);
    expect(getOfficialResult).toHaveBeenCalledOnce(); expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); await waitFor(() => expect(getOfficialResult).toHaveBeenCalledTimes(2));
  });
  it("keeps the saved result in view when a reread fails", async () => {
    vi.mocked(getOfficialResult).mockResolvedValue(failed(2)); renderPage(); await ready();
    vi.mocked(getResultOptions).mockRejectedValueOnce(new ApiError(503, "INTERNAL_ERROR", "private database"));
    vi.mocked(getOfficialResult).mockRejectedValueOnce(new ApiError(503, "INTERNAL_ERROR", "private database"));
    await live.announce(null); await waitFor(() => expect(getOfficialResult).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Not sent")).toBeTruthy(); expect(screen.getByRole("heading", { name: "Local Boulder Open" })).toBeTruthy();
    expect(screen.queryByText(/Couldn't load result entry/)).toBeNull();
  });
  it("shows that a result can no longer be entered when a reread finds it gone", async () => {
    renderPage(); await ready(); vi.mocked(getOfficialResult).mockRejectedValueOnce(new ApiError(404, "REGISTRATION_NOT_FOUND", "This registration is unavailable."));
    await live.announce(changed); await screen.findByText("This registration is unavailable."); expect(screen.queryByRole("button", { name: "Record send" })).toBeNull();
  });
  it("handles a selected-result read failure and reloads both metadata and result", async () => {
    vi.mocked(getOfficialResult).mockRejectedValueOnce(new ApiError(404, "REGISTRATION_NOT_FOUND", "This registration is unavailable."));
    renderPage(); await screen.findByText("This registration is unavailable.");
    expect(screen.queryByRole("button", { name: "Record send" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready(); expect(getResultOptions).toHaveBeenCalledTimes(2);
  });
  it.each(["Results can be entered on the competition date.", "This competition is cancelled.", "Set a scoring format first."])("honors the API's recording restriction: %s", async reason => {
    vi.mocked(getResultOptions).mockResolvedValue({ ...resultOptions, canRecord: { allowed: false, reasons: [reason] } });
    renderPage(); await ready(); expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Record send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Scoring format" })).toBeTruthy(); expect(saveOfficialResult).not.toHaveBeenCalled();
  });
  it("blocks a Climber whose fresh registration is no longer confirmed", async () => {
    vi.mocked(getOfficialResult).mockResolvedValue({ ...emptyResultEntry, climber: { ...emptyResultEntry.climber, registrationStatus: "WAITLIST" } });
    renderPage(); await ready(); expect(screen.getByText(/no longer has a confirmed registration/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Record send" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("disables a route without points but allows a zero-point problem", async () => {
    vi.mocked(getResultOptions).mockResolvedValue({ ...resultOptions, routes: [{ ...resultOptions.routes[0], pointValue: 0 }, { ...resultOptions.routes[1], pointValue: null }] });
    vi.mocked(getOfficialResult).mockResolvedValue({ ...emptyResultEntry, route: { ...emptyResultEntry.route, pointValue: 0 } });
    renderPage(); await ready(); expect((screen.getByRole("option", { name: /Points not set/ }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Record send" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("shows the official score and total returned by the server without calculating them", async () => {
    const entry = savedResult({ attempts: 2, flash: false, officialScore: 37 }); entry.climberTotal.totalScore = 251;
    vi.mocked(getOfficialResult).mockResolvedValue(entry); renderPage(); await ready();
    expect(screen.getByText("37 points")).toBeTruthy(); expect(screen.getByText("251 points")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Record send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("checkbox", { name: /flash/i })).toBeNull();
  });
  it("confirms the selected pair and can cancel without recording an attempt", async () => {
    renderPage(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Record failed attempt" }));
    const dialog = screen.getByRole("alertdialog"); expect(within(dialog).getByText("Ada Climber")).toBeTruthy();
    expect(within(dialog).getByText(/Yellow Slab/)).toBeTruthy(); expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); expect(screen.queryByRole("alertdialog")).toBeNull(); expect(recordOfficialAttempt).not.toHaveBeenCalled();
  });
  it("records one failed attempt and replaces the saved summary with the server response", async () => {
    renderPage(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Record failed attempt" })); confirm();
    await screen.findByText("Attempt recorded and saved."); expect(recordOfficialAttempt).toHaveBeenCalledExactlyOnceWith(ids, false, expect.any(AbortSignal));
    expect(screen.getByText("Not sent")).toBeTruthy(); expect(screen.queryByText(/No result has been recorded/)).toBeNull();
  });
  it("records a first-attempt send and displays the server's flash", async () => {
    vi.mocked(recordOfficialAttempt).mockResolvedValue(savedResult()); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Record send" })); confirm(); await screen.findByText("Attempt recorded and saved.");
    expect(recordOfficialAttempt).toHaveBeenCalledExactlyOnceWith(ids, true, expect.any(AbortSignal)); expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getAllByText("100 points").length).toBeGreaterThan(0);
  });
  it("locks selectors, cancellation, reloading and duplicate confirmation during a write", async () => {
    const pending = deferred<ResultEntry>(); vi.mocked(recordOfficialAttempt).mockReturnValueOnce(pending.promise);
    renderPage(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Record failed attempt" })); confirm(); confirm();
    await screen.findByText("Saving official result…"); const dialog = screen.getByRole("alertdialog");
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.getByRole("alertdialog")).toBeTruthy(); expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Registered Climber").matches(":disabled")).toBe(true);
    await live.announce(changed); expect(getOfficialResult).toHaveBeenCalledOnce();
    vi.mocked(getOfficialResult).mockResolvedValue(failed());
    expect(recordOfficialAttempt).toHaveBeenCalledOnce(); await act(async () => pending.resolve(failed()));
    await screen.findByText("Attempt recorded and saved."); expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(getOfficialResult).toHaveBeenCalledTimes(2)); expect(screen.getByText("Attempt recorded and saved.")).toBeTruthy();
    expect(screen.getByText("Not sent")).toBeTruthy();
  });
  it.each(["", "-1", "1.5", "6"])("rejects invalid total attempts %s before requesting a save", async value => {
    renderPage(); await ready(); totals(value); review();
    expect(screen.getByText("Enter a whole number of attempts from 0 to 5.")).toBeTruthy();
    expect(screen.getByLabelText("Total attempts").getAttribute("aria-invalid")).toBe("true"); expect(document.activeElement).toBe(screen.getByLabelText("Total attempts"));
    expect(saveOfficialResult).not.toHaveBeenCalled(); expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("rejects a send with zero attempts and explains automatic flash recording", async () => {
    renderPage(); await ready(); totals("0", true); review(); expect(screen.getByText("A send needs at least one attempt.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Total attempts"), { target: { value: "1" } }); expect(screen.getByText(/This first-attempt send will be recorded as a flash/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /flash/i })).toBeNull();
  });
  it("confirms and saves corrected totals without submitting a client score or flash", async () => {
    vi.mocked(getOfficialResult).mockResolvedValue(failed(2)); renderPage(); await ready(); totals("1", true); review();
    expect(screen.getByRole("alertdialog").textContent).toContain("This replaces the existing result"); confirm(); await screen.findByText("Official result saved.");
    expect(saveOfficialResult).toHaveBeenCalledExactlyOnceWith(ids, { attempts: 1, sent: true }, expect.any(AbortSignal));
    expect(screen.getByText("Yes")).toBeTruthy(); expect(screen.getByLabelText("Record next attempt")).toBeTruthy();
  });
  it("does not resubmit unchanged totals", async () => {
    vi.mocked(getOfficialResult).mockResolvedValue(failed(2)); renderPage(); await ready(); totals("2"); review();
    expect(screen.getByText("Change the attempts or send status before saving.")).toBeTruthy(); expect(saveOfficialResult).not.toHaveBeenCalled();
  });
  it("blocks next-attempt buttons at the limit while retaining correction controls", async () => {
    vi.mocked(getOfficialResult).mockResolvedValue(failed(5)); renderPage(); await ready();
    expect((screen.getByRole("button", { name: "Record failed attempt" }) as HTMLButtonElement).disabled).toBe(true);
    totals("4"); review(); expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
  it("preserves totals after server validation and clears field feedback on editing", async () => {
    vi.mocked(saveOfficialResult).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Check the result.", { attempts: "Competition allows fewer attempts." }));
    renderPage(); await ready(); totals("3"); review(); confirm(); await screen.findByText("Competition allows fewer attempts.");
    expect((screen.getByLabelText("Total attempts") as HTMLInputElement).value).toBe("3");
    fireEvent.change(screen.getByLabelText("Total attempts"), { target: { value: "2" } }); expect(screen.queryByText("Competition allows fewer attempts.")).toBeNull();
  });
  it.each([new ApiError(0, "NETWORK_ERROR", "private socket data"), new ApiError(500, "INTERNAL_ERROR", "private database failure"), new Error("Wrong response identity")])("pauses uncertain writes until a fresh read (%s)", async error => {
    vi.mocked(recordOfficialAttempt).mockRejectedValueOnce(error); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Record failed attempt" })); confirm(); await screen.findByText(/Couldn't confirm whether this result was saved/);
    expect(screen.queryByText(/private/)).toBeNull(); expect(recordOfficialAttempt).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Record send" }) as HTMLButtonElement).disabled).toBe(true);
    vi.mocked(getOfficialResult).mockResolvedValue(failed()); fireEvent.click(screen.getByRole("button", { name: "Load the saved result" }));
    await waitFor(() => expect(screen.queryByText(/Recording is paused/)).toBeNull()); await ready();
    expect((screen.getByRole("button", { name: "Record send" }) as HTMLButtonElement).disabled).toBe(false); expect(screen.getByText("Not sent")).toBeTruthy();
    expect(getResultOptions).toHaveBeenCalledTimes(2); expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Saved official result" }));
  });
  it("keeps recording paused when a change is announced, until the saved result is loaded", async () => {
    vi.mocked(recordOfficialAttempt).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "offline")); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Record failed attempt" })); confirm(); await screen.findByText(/Recording is paused/);
    await live.announce(changed); expect(getOfficialResult).toHaveBeenCalledOnce(); expect(screen.getByText(/Recording is paused/)).toBeTruthy();
  });
  it("requires loading the saved result after a concurrent-result conflict", async () => {
    vi.mocked(recordOfficialAttempt).mockRejectedValueOnce(new ApiError(409, "ALREADY_SENT", "This problem was already sent.")); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Record send" })); confirm(); await screen.findByText("This problem was already sent.");
    expect(screen.getByText(/Recording is paused/)).toBeTruthy(); expect(recordOfficialAttempt).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Load the saved result" })).toBeTruthy();
  });
  it.each([401, 403, 404])("removes private entry and controls after write access is lost (%s)", async status => {
    vi.mocked(recordOfficialAttempt).mockRejectedValueOnce(new ApiError(status, "ACCESS_DENIED", "Your gym access is unavailable.")); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Record send" })); confirm(); await screen.findByText("Your gym access is unavailable.");
    expect(screen.queryByText("Local Boulder Open")).toBeNull(); expect(screen.queryByLabelText("Registered Climber")).toBeNull();
    expect(screen.queryByRole("button", { name: "Record send" })).toBeNull();
  });
  it("aborts a stale pair read and ignores its late response", async () => {
    const pending = deferred<ResultEntry>(); vi.mocked(getOfficialResult).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...emptyResultEntry, climber: resultOptions.climbers[1] });
    renderPage(); await screen.findByText("Loading selected result…"); const signal = vi.mocked(getOfficialResult).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Choose another pair" })); await ready(); await act(async () => pending.resolve(savedResult()));
    expect(signal?.aborted).toBe(true); expect(screen.getByText(/No result has been recorded/)).toBeTruthy();
    expect(within(screen.getByLabelText("Selected Climber and boulder problem")).getByText("Ben Sender")).toBeTruthy();
  });
  it("aborts a pending write on navigation and never applies it to a different Climber", async () => {
    const pending = deferred<ResultEntry>(); vi.mocked(recordOfficialAttempt).mockReturnValueOnce(pending.promise);
    renderPage(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Record send" })); confirm();
    const signal = vi.mocked(recordOfficialAttempt).mock.calls[0][2];
    vi.mocked(getOfficialResult).mockResolvedValueOnce({ ...emptyResultEntry, climber: resultOptions.climbers[1] });
    fireEvent.click(screen.getByRole("button", { name: "Choose another pair" })); await ready(); await act(async () => pending.resolve(savedResult()));
    expect(signal?.aborted).toBe(true); expect(screen.queryByText("Attempt recorded and saved.")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull(); expect(screen.getByText(/No result has been recorded/)).toBeTruthy();
  });
  it("respects the scoring API's supported recording fields", async () => {
    const options = structuredClone(resultOptions); options.scoring!.records.flash = false; vi.mocked(getResultOptions).mockResolvedValue(options);
    renderPage(); await ready(); expect(screen.queryByText("Flash", { selector: "dt" })).toBeNull(); expect(screen.queryByText(/flash automatically/)).toBeNull();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s before loading private competition results", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); await screen.findByRole("heading", { name: "Gym administrator access required" }); expect(getResultOptions).not.toHaveBeenCalled();
  });
  it("requires a login for a Visitor", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false }); renderPage();
    await screen.findByRole("heading", { name: "Welcome back" }); expect(getResultOptions).not.toHaveBeenCalled();
  });
});
