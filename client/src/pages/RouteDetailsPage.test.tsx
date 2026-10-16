import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { createCompetitionRoute, getCompetitionRoute, updateCompetitionRoute, type ManagedRoute } from "../lib/routesApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/routesApi.ts", () => ({ listCompetitionRoutes: vi.fn(), createCompetitionRoute: vi.fn(), getCompetitionRoute: vi.fn(), updateCompetitionRoute: vi.fn() }));
vi.mock("../lib/gymAdminApi.ts", () => ({ fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), getManagedCompetition: vi.fn(), createManagedCompetition: vi.fn(), updateManagedCompetition: vi.fn() }));
const competition: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" },
  name: "Autumn Open", date: "2026-11-14", location: "Toronto", status: "PUBLISHED", registrationStatus: "OPEN", capacity: 80,
  tools: [{ key: "routes", label: "Boulder problems", story: "US-016" }],
};
const route = {
  routeId: "507f1f77bcf86cd799439021", competitionId: competition._id,
  routeNumber: "A8", name: "Summit Traverse", grade: "V4", pointValue: 25, notes: "Overhang\nRed holds", official: true,
} satisfies ManagedRoute;
const otherRouteId = "507f1f77bcf86cd799439022";
const otherCompetitionId = "507f1f77bcf86cd799439019";
const path = `/gym-admin/competitions/${competition._id}/routes/${route.routeId}`;
const createPath = `/gym-admin/competitions/${competition._id}/routes/new`;
const listPath = `/gym-admin/competitions/${competition._id}/routes`;
function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(path.replace(route.routeId, otherRouteId))}>Select other route</button>
    <button onClick={() => navigate(path.replace(competition._id, otherCompetitionId))}>Select other competition</button></>;
}
function renderPage(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
async function ready() { return screen.findByRole("form", { name: "Edit route details" }); }
function edit(label = "Official V-grade", value = "V5") { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
function saved(field: string) { return within(screen.getByRole("region", { name: "Saved route information" })).getByText(field, { selector: "dt" }).nextElementSibling?.textContent; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}
beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(getCompetitionRoute).mockReset().mockResolvedValue({ ...route });
  vi.mocked(updateCompetitionRoute).mockReset().mockImplementation(async (_event, _id, changes) => ({ ...route, ...changes, ...(changes.notes === "" ? { notes: undefined } : {}) }));
  vi.mocked(createCompetitionRoute).mockReset().mockResolvedValue({ routeId: route.routeId, competitionId: competition._id, grade: "V4", official: true });
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-017 #79/#80 route details and permitted editing", () => {
  it("displays the selected competition and saved route information with prefilled edit fields", async () => {
    renderPage(); await ready();
    expect(screen.getByRole("heading", { name: "Route details", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: route.name })).toBeTruthy(); expect(screen.getByText("Route A8")).toBeTruthy();
    expect(screen.getByText(competition.name)).toBeTruthy(); expect(screen.getByText("at Brian Test Gym")).toBeTruthy();
    expect(screen.getByText("Nov 14, 2026")).toBeTruthy();
    expect(saved("Official V-grade")).toBe("V4"); expect(saved("Point value")).toBe("25"); expect(saved("Grade status")).toBe("Official");
    expect(saved("Notes")).toBe(route.notes);
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe("V4");
    expect((screen.getByLabelText(/Point value/) as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText(/Notes/, { selector: "textarea" }) as HTMLTextAreaElement).value).toBe(route.notes);
    expect(screen.queryByLabelText(/^Route name/)).toBeNull(); expect(screen.queryByLabelText("Route number")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByRole("button", { name: /delete|remove/i })).toBeNull();
    expect(getCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, expect.any(AbortSignal));
  });
  it("preserves gym, period and page filters on both return links", async () => {
    const search = `?period=past&gymId=${competition.gymId}&page=2`;
    renderPage(path + search); await ready();
    expect(screen.getByRole("link", { name: "Back to boulder problems" }).getAttribute("href")).toBe(listPath + search);
    expect(screen.getByRole("link", { name: "Back to competition" }).getAttribute("href")).toBe(`/gym-admin/competitions/${competition._id}${search}`);
  });
  it("waits for the competition access check before loading route data", async () => {
    const pending = deferred<ManagedCompetitionDetails>(); vi.mocked(getManagedCompetition).mockReturnValue(pending.promise);
    renderPage(); expect(await screen.findByText("Loading route details…")).toBeTruthy(); expect(getCompetitionRoute).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).toBeNull(); await act(async () => pending.resolve(competition)); await ready();
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s before private route reads", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other-user", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled(); expect(getCompetitionRoute).not.toHaveBeenCalled(); expect(updateCompetitionRoute).not.toHaveBeenCalled();
  });
  it("requires login for a Visitor", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(); expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy(); expect(getCompetitionRoute).not.toHaveBeenCalled();
  });
  it("does not read a route after the selected competition is rejected", async () => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."));
    renderPage(); expect(await screen.findByText("Competition not found.")).toBeTruthy(); expect(getCompetitionRoute).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])("hides route data and edit controls when its read is rejected (%s)", async status => {
    vi.mocked(getCompetitionRoute).mockRejectedValue(new ApiError(status, "ROUTE_NOT_FOUND", "Route unavailable."));
    renderPage(); expect(await screen.findByText("Route unavailable.")).toBeTruthy(); expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByText(route.name)).toBeNull(); expect(screen.queryByText(competition.name)).toBeNull();
  });
  it("shows a readable retry for load failures without leaking internal messages", async () => {
    vi.mocked(getCompetitionRoute).mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "private database password"));
    renderPage(); expect(await screen.findByText("Couldn't load route details. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private database/)).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });
  it("calls a route without a name by its number", async () => {
    vi.mocked(getCompetitionRoute).mockResolvedValue({ ...route, name: undefined });
    renderPage(); await ready();
    expect(screen.getByRole("heading", { name: "Route A8", level: 2 })).toBeTruthy();
    expect(screen.getAllByText("Route A8")).toHaveLength(1);
  });
  it("shows missing points/notes and a zero point value correctly", async () => {
    vi.mocked(getCompetitionRoute).mockResolvedValue({ ...route, pointValue: undefined, notes: undefined, official: false });
    renderPage(); await ready(); expect(saved("Point value")).toBe("Not set"); expect(saved("Notes")).toBe("No notes added."); expect(saved("Grade status")).toBe("Not official");
    vi.mocked(getCompetitionRoute).mockResolvedValueOnce({ ...route, pointValue: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh route details" })); await ready(); expect(saved("Point value")).toBe("0");
  });
  it("does not send an unchanged or whitespace-only edit", async () => {
    renderPage(); const form = await ready(); expect((screen.getByRole("button", { name: "Save route details" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(form); expect(updateCompetitionRoute).not.toHaveBeenCalled(); expect(screen.getByText("Change at least one route detail.")).toBeTruthy();
    edit("Official V-grade", " V4 "); fireEvent.submit(form); expect(updateCompetitionRoute).not.toHaveBeenCalled();
  });
  it.each(["", "v4", "V04", "V-1", "V4.5", "V18"])("rejects invalid grade '%s', preserves it and focuses the error", async grade => {
    renderPage(); const form = await ready(); edit("Official V-grade", grade); fireEvent.submit(form);
    expect(updateCompetitionRoute).not.toHaveBeenCalled(); expect(saved("Official V-grade")).toBe("V4");
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe(grade);
    const input = screen.getByLabelText("Official V-grade"); expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("edit-route-grade-error"); await waitFor(() => expect(document.activeElement).toBe(input));
  });
  it("sends only the explicitly changed official grade and shows the confirmed response", async () => {
    const pending = deferred<ManagedRoute>(); vi.mocked(updateCompetitionRoute).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); edit("Official V-grade", " V5 "); fireEvent.submit(form);
    expect(updateCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, { grade: "V5" }, expect.any(AbortSignal));
    expect(saved("Official V-grade")).toBe("V4"); expect(screen.queryByText("Route details saved.")).toBeNull();
    await act(async () => pending.resolve({ ...route, grade: "V5" })); await screen.findByText("Route details saved.");
    expect(saved("Official V-grade")).toBe("V5"); expect(saved("Notes")).toBe(route.notes);
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe("V5");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("Route details saved.")));
  });
  it.each(["0", "30", "10000"])("saves whole point value %s without changing the official grade", async pointValue => {
    renderPage(); const form = await ready(); fireEvent.change(screen.getByLabelText(/Point value/), { target: { value: pointValue } }); fireEvent.submit(form);
    await screen.findByText("Route details saved.");
    expect(updateCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, { pointValue: Number(pointValue) }, expect.any(AbortSignal));
    expect(saved("Point value")).toBe(pointValue); expect(saved("Official V-grade")).toBe("V4");
  });
  it.each(["-1", "2.5", "10001"])("rejects point value %s before saving", async pointValue => {
    renderPage(); const form = await ready(); const points = screen.getByLabelText(/Point value/);
    fireEvent.change(points, { target: { value: pointValue } }); fireEvent.submit(form);
    expect(updateCompetitionRoute).not.toHaveBeenCalled(); expect(screen.getByText("Enter a whole number of points from 0 to 10,000.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(points)); expect(saved("Point value")).toBe("25");
  });
  it("keeps existing points when that input is blank, matching the update API", async () => {
    renderPage(); const form = await ready(); edit(); fireEvent.change(screen.getByLabelText(/Point value/), { target: { value: "" } }); fireEvent.submit(form);
    await screen.findByText("Route details saved."); expect(updateCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, { grade: "V5" }, expect.any(AbortSignal));
    expect(saved("Point value")).toBe("25"); expect((screen.getByLabelText(/Point value/) as HTMLInputElement).value).toBe("25");
  });
  it("adds optional points when the saved route does not yet have them", async () => {
    vi.mocked(getCompetitionRoute).mockResolvedValue({ ...route, pointValue: undefined }); renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText(/Point value/), { target: { value: "0" } }); fireEvent.submit(form); await screen.findByText("Route details saved.");
    expect(updateCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, { pointValue: 0 }, expect.any(AbortSignal));
  });
  it("limits the point value and notes to what the API accepts", async () => {
    renderPage(); await ready();
    const points = screen.getByLabelText(/Point value/);
    expect([points.getAttribute("min"), points.getAttribute("max"), points.getAttribute("step")]).toEqual(["0", "10000", "1"]);
    expect(screen.getByLabelText(/Notes/, { selector: "textarea" }).getAttribute("maxlength")).toBe("2000");
  });
  it("still saves other details of a route saved before the current limits", async () => {
    vi.mocked(getCompetitionRoute).mockResolvedValue({ ...route, grade: "V18", pointValue: 2.5 });
    renderPage(); const form = await ready();
    fireEvent.change(screen.getByLabelText(/Notes/, { selector: "textarea" }), { target: { value: "New notes" } }); fireEvent.submit(form);
    await screen.findByText("Route details saved.");
    expect(updateCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, { notes: "New notes" }, expect.any(AbortSignal));
  });
  it("rejects a partial numeric entry reported as badInput by the browser", async () => {
    renderPage(); const form = await ready(); const points = screen.getByLabelText(/Point value/) as HTMLInputElement;
    Object.defineProperty(points, "validity", { configurable: true, value: { badInput: true } });
    edit(); fireEvent.submit(form); expect(updateCompetitionRoute).not.toHaveBeenCalled(); expect(points.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(points));
  });
  it("clears notes by sending an explicit empty string, then displays the server's absence", async () => {
    renderPage(); const form = await ready(); fireEvent.change(screen.getByLabelText(/Notes/, { selector: "textarea" }), { target: { value: "  " } }); fireEvent.submit(form);
    await screen.findByText("Route details saved."); expect(updateCompetitionRoute).toHaveBeenCalledWith(competition._id, route.routeId, { notes: "" }, expect.any(AbortSignal));
    expect(saved("Notes")).toBe("No notes added."); expect(saved("Official V-grade")).toBe("V4");
  });
  it("trims edited notes and keeps their line breaks", async () => {
    renderPage(); const form = await ready(); fireEvent.change(screen.getByLabelText(/Notes/, { selector: "textarea" }), { target: { value: "  New setting\nBlue holds  " } }); fireEvent.submit(form);
    await screen.findByText("Route details saved."); expect(saved("Notes")).toBe("New setting\nBlue holds");
  });
  it("discards edits and validation messages without sending a request", async () => {
    renderPage(); const form = await ready(); edit("Official V-grade", "bad"); fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe("V4"); expect(screen.queryByRole("alert")).toBeNull(); expect(updateCompetitionRoute).not.toHaveBeenCalled();
  });
  it("guards repeated writes and disables editing, discard and refresh while saving", async () => {
    const pending = deferred<ManagedRoute>(); vi.mocked(updateCompetitionRoute).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); edit(); fireEvent.submit(form); fireEvent.submit(form);
    expect(updateCompetitionRoute).toHaveBeenCalledOnce(); expect(form.querySelector("fieldset")?.disabled).toBe(true);
    for (const name of ["Saving route…", "Discard changes", "Refresh route details"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ...route, grade: "V5" })); await screen.findByText("Route details saved.");
    expect((screen.getByRole("button", { name: "Refresh route details" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("displays server validation and focuses its permitted field while preserving confirmed values", async () => {
    vi.mocked(updateCompetitionRoute).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Check the route.", { grade: "Grade rejected by server.", official: "private flag" }));
    renderPage(); const form = await ready(); edit(); fireEvent.submit(form);
    expect(await screen.findByText("Grade rejected by server.")).toBeTruthy(); await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Official V-grade")));
    expect(saved("Official V-grade")).toBe("V4"); expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe("V5"); expect(screen.queryByText("private flag")).toBeNull();
  });
  it.each([
    new ApiError(0, "NETWORK_ERROR", "private network"), new ApiError(0, "TIMEOUT", "private timeout"),
    new ApiError(503, "INTERNAL_ERROR", "private database"), new Error("private crash"),
  ])("preserves draft and last confirmed details after an unconfirmed save (%s)", async error => {
    vi.mocked(updateCompetitionRoute).mockRejectedValueOnce(error); renderPage(); const form = await ready(); edit(); fireEvent.submit(form);
    expect(await screen.findByText(/Couldn't confirm the save/)).toBeTruthy(); expect(saved("Official V-grade")).toBe("V4");
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe("V5"); expect(screen.queryByText(/private/)).toBeNull();
    expect(screen.queryByText("Route details saved.")).toBeNull(); expect(updateCompetitionRoute).toHaveBeenCalledOnce();
  });
  it("shows conflict feedback without claiming a saved route", async () => {
    vi.mocked(updateCompetitionRoute).mockRejectedValueOnce(new ApiError(409, "ROUTE_EXISTS", "This competition already has a route with this number."));
    renderPage(); const form = await ready(); edit(); fireEvent.submit(form); expect(await screen.findByText(/already has a route/)).toBeTruthy();
    expect(saved("Official V-grade")).toBe("V4"); expect(screen.queryByText("Route details saved.")).toBeNull();
  });
  it.each([401, 403, 404])("removes private details if the edit loses access (%s)", async status => {
    vi.mocked(updateCompetitionRoute).mockRejectedValueOnce(new ApiError(status, "ROUTE_NOT_FOUND", "Route no longer available."));
    renderPage(); const form = await ready(); edit(); fireEvent.submit(form); expect(await screen.findByText("Route no longer available.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText(route.name)).toBeNull(); expect(screen.queryByText(competition.name)).toBeNull();
  });
  it("refreshes confirmed saved values instead of relying on old form state", async () => {
    renderPage(); const form = await ready(); edit(); fireEvent.submit(form); await screen.findByText("Route details saved.");
    vi.mocked(getCompetitionRoute).mockResolvedValueOnce({ ...route, grade: "V5", notes: "Later confirmed note" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh route details" })); await ready();
    expect(saved("Official V-grade")).toBe("V5"); expect(saved("Notes")).toBe("Later confirmed note"); expect(getCompetitionRoute).toHaveBeenCalledTimes(2);
  });
  it("aborts a late route read and clears previous state when selecting another route", async () => {
    const pending = deferred<ManagedRoute>(); vi.mocked(getCompetitionRoute).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...route, routeId: otherRouteId, name: "Second route", grade: "V2" });
    renderPage(); await waitFor(() => expect(getCompetitionRoute).toHaveBeenCalledOnce());
    const signal = vi.mocked(getCompetitionRoute).mock.calls[0][2]; fireEvent.click(screen.getByRole("button", { name: "Select other route" })); await ready();
    await act(async () => pending.resolve(route)); expect(signal?.aborted).toBe(true); expect(screen.queryByText(route.name)).toBeNull(); expect(saved("Official V-grade")).toBe("V2");
  });
  it("does not begin a stale route read after its pending competition read is aborted", async () => {
    const pending = deferred<ManagedCompetitionDetails>(); vi.mocked(getManagedCompetition).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...competition, _id: otherCompetitionId, name: "Second competition" });
    vi.mocked(getCompetitionRoute).mockResolvedValueOnce({ ...route, competitionId: otherCompetitionId });
    renderPage(); await screen.findByText("Loading route details…"); fireEvent.click(screen.getByRole("button", { name: "Select other competition" })); await ready();
    await act(async () => pending.resolve(competition)); expect(getCompetitionRoute).toHaveBeenCalledOnce();
    expect(getCompetitionRoute).toHaveBeenCalledWith(otherCompetitionId, route.routeId, expect.any(AbortSignal));
  });
  it("aborts writes on route change and ignores their late success", async () => {
    const pending = deferred<ManagedRoute>(); vi.mocked(updateCompetitionRoute).mockReturnValueOnce(pending.promise);
    renderPage(); const form = await ready(); edit(); fireEvent.submit(form); const signal = vi.mocked(updateCompetitionRoute).mock.calls[0][3];
    vi.mocked(getCompetitionRoute).mockResolvedValueOnce({ ...route, routeId: otherRouteId, name: "Second route", grade: "V2" });
    fireEvent.click(screen.getByRole("button", { name: "Select other route" })); await ready(); await act(async () => pending.resolve({ ...route, grade: "V5" }));
    expect(signal?.aborted).toBe(true); expect(screen.queryByText("Route details saved.")).toBeNull(); expect(saved("Official V-grade")).toBe("V2");
    edit("Official V-grade", "V3"); fireEvent.submit(await ready()); expect(updateCompetitionRoute).toHaveBeenLastCalledWith(competition._id, otherRouteId, { grade: "V3" }, expect.any(AbortSignal));
  });
  it("opens a newly created route from the creation confirmation, preserving filters", async () => {
    const search = `?period=all&gymId=${competition.gymId}&page=2`; renderPage(createPath + search);
    const form = await screen.findByRole("form", { name: "Add boulder problem" });
    fireEvent.change(screen.getByLabelText("Route number"), { target: { value: "A8" } }); fireEvent.change(screen.getByLabelText(/^Route name/), { target: { value: route.name } });
    edit("Official V-grade", "V4"); fireEvent.submit(form);
    const link = await screen.findByRole("link", { name: "View route details" }); expect(link.getAttribute("href")).toBe(path + search); fireEvent.click(link); await ready();
    expect(saved("Official V-grade")).toBe("V4"); expect(screen.getByRole("link", { name: "Back to boulder problems" }).getAttribute("href")).toBe(listPath + search);
  });
});
