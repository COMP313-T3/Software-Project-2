import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getManagedCompetition, type ManagedCompetitionDetails } from "../lib/gymAdminApi.ts";
import { createCompetitionRoute, type CreatedRoute } from "../lib/routesApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/routesApi.ts", () => ({ createCompetitionRoute: vi.fn() }));
vi.mock("../lib/gymAdminApi.ts", () => ({ fetchGymAdminDashboard: vi.fn(), listManagedCompetitions: vi.fn(), getManagedCompetition: vi.fn(), createManagedCompetition: vi.fn(), updateManagedCompetition: vi.fn() }));
const competition: ManagedCompetitionDetails = {
  _id: "507f1f77bcf86cd799439011", gymId: "507f1f77bcf86cd799439012", gym: { _id: "507f1f77bcf86cd799439012", name: "Brian Test Gym" },
  name: "Autumn Open", date: "2026-11-14", location: "Toronto", status: "PUBLISHED", registrationStatus: "OPEN", capacity: 80,
  tools: [{ key: "routes", label: "Boulder problems", story: "US-016" }],
};
const otherId = "507f1f77bcf86cd799439019";
const path = `/gym-admin/competitions/${competition._id}/routes/new`;
const created: CreatedRoute = { routeId: "507f1f77bcf86cd799439021", competitionId: competition._id, grade: "V4", official: true };
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(path.replace(competition._id, otherId))}>Select other competition</button>;
}
function renderPage(url = path) { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function ready() { return screen.findByRole("form", { name: "Add boulder problem" }); }
function fill() {
  fireEvent.change(screen.getByLabelText("Route number"), { target: { value: " A8 " } });
  fireEvent.change(screen.getByLabelText("Route name"), { target: { value: " Summit Traverse " } });
  fireEvent.change(screen.getByLabelText("Official V-grade"), { target: { value: " V4 " } });
}
beforeEach(() => {
  vi.mocked(getManagedCompetition).mockReset().mockResolvedValue(competition);
  vi.mocked(createCompetitionRoute).mockReset().mockResolvedValue(created);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture-csrf", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "gym-admin-id", role: "GYM_ADMIN", token: "fixture-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "gym-admin-id", email: "gym@example.com", role: "GYM_ADMIN", session: { expiresIn: 3600, limitReached: false } });
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-016 #71/#72 add route page and route fields", () => {
  it("loads the selected competition before showing a clearly labelled form", async () => {
    const pending = deferred<ManagedCompetitionDetails>(); vi.mocked(getManagedCompetition).mockReturnValue(pending.promise);
    renderPage(); expect(await screen.findByText("Loading selected competition…")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    await act(async () => pending.resolve(competition)); await ready();
    expect(screen.getByRole("heading", { name: "Add route", level: 1 })).toBeTruthy();
    expect(within(screen.getByLabelText("Selected competition")).getByText("Autumn Open")).toBeTruthy();
    expect(screen.getByText(/Brian Test Gym/)).toBeTruthy(); expect(screen.getByText(competition.date)).toBeTruthy();
    expect(getManagedCompetition).toHaveBeenCalledWith(competition._id, expect.any(AbortSignal));
    expect(document.activeElement).toBe(screen.getByLabelText("Route number"));
    expect(screen.getByLabelText(/Point value/).getAttribute("required")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("preserves the selected gym, period and page on return links", async () => {
    const search = `?gymId=${competition.gymId}&period=past&page=2`;
    renderPage(path + search); await ready();
    for (const name of ["Back to competition", "Cancel"]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(`/gym-admin/competitions/${competition._id}${search}`);
    }
  });
  it.each(["ADMIN", "CLIMBER"] as const)("blocks %s before reading private event data", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "wrong-role", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } });
    renderPage(); expect(await screen.findByRole("heading", { name: "Gym administrator access required" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled(); expect(createCompetitionRoute).not.toHaveBeenCalled();
  });
  it("requires a login for a Visitor", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "fixture", sessionCookie: false });
    renderPage(); expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(getManagedCompetition).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])("hides route inputs for a denied or foreign competition (%s)", async status => {
    vi.mocked(getManagedCompetition).mockRejectedValue(new ApiError(status, "COMPETITION_NOT_FOUND", "Competition unavailable."));
    renderPage(); expect(await screen.findByText("Competition unavailable.")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull(); expect(createCompetitionRoute).not.toHaveBeenCalled();
  });
  it("offers a readable retry after a load failure without leaking internal errors", async () => {
    vi.mocked(getManagedCompetition).mockRejectedValueOnce(new Error("private database password"));
    renderPage(); expect(await screen.findByText("Couldn't load this competition. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/private database/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await ready();
  });
  it("focuses the first missing field, associates error text and does not POST an empty form", async () => {
    renderPage(); const form = await ready(); fireEvent.submit(form);
    expect(createCompetitionRoute).not.toHaveBeenCalled();
    const input = screen.getByLabelText("Route number");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("route-routeNumber-error");
    expect(screen.getByText("Enter the route name.")).toBeTruthy(); expect(screen.getByText("Enter a V-grade, such as V4.")).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });
  it.each(["V04", "v4", "V-1", "V4.5"])("rejects %s without automatically changing the setter's grade", async grade => {
    renderPage(); const form = await ready(); fill();
    fireEvent.change(screen.getByLabelText("Official V-grade"), { target: { value: grade } }); fireEvent.submit(form);
    expect(createCompetitionRoute).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("Official V-grade"));
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe(grade);
  });
  it("saves trimmed required fields to this competition and omits unused points", async () => {
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    expect(await screen.findByRole("heading", { name: "Route created" })).toBeTruthy();
    expect(createCompetitionRoute).toHaveBeenCalledWith(competition._id, { routeNumber: "A8", name: "Summit Traverse", grade: "V4" }, expect.any(AbortSignal));
    expect(screen.getByText("Official V-grade", { selector: "dt" }).nextElementSibling?.textContent).toBe("V4");
    expect(screen.queryByText("Point value", { selector: "dt" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Route created" })));
  });
  it.each(["0", "2.5"])("saves point value %s as a number and trims notes", async value => {
    renderPage(); const form = await ready(); fill();
    fireEvent.change(screen.getByLabelText(/Point value/), { target: { value } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: "  Overhang\nUse red holds  " } }); fireEvent.submit(form);
    await screen.findByRole("heading", { name: "Route created" });
    expect(createCompetitionRoute).toHaveBeenCalledWith(competition._id, expect.objectContaining({ pointValue: Number(value), notes: "Overhang\nUse red holds" }), expect.any(AbortSignal));
    expect(screen.getByText("Point value", { selector: "dt" }).nextElementSibling?.textContent).toBe(value);
    expect(screen.getByText(/Use red holds/)).toBeTruthy();
  });
  it("rejects a partial numeric entry even when the browser exposes an empty value", async () => {
    renderPage(); const form = await ready(); fill();
    const points = screen.getByLabelText(/Point value/) as HTMLInputElement;
    Object.defineProperty(points, "validity", { configurable: true, value: { badInput: true } });
    fireEvent.submit(form);
    expect(createCompetitionRoute).not.toHaveBeenCalled(); expect(document.activeElement).toBe(points);
    expect(screen.getByText("Enter a finite number of points, or leave this blank.")).toBeTruthy();
  });
  it("waits for confirmation and prevents repeated submission while saving", async () => {
    const pending = deferred<CreatedRoute>(); vi.mocked(createCompetitionRoute).mockReturnValue(pending.promise);
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form); fireEvent.submit(form);
    expect(createCompetitionRoute).toHaveBeenCalledOnce(); expect(screen.queryByRole("heading", { name: "Route created" })).toBeNull();
    expect((screen.getByRole("button", { name: "Saving route…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(form.querySelector("fieldset")?.disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("aria-disabled")).toBe("true");
    await act(async () => pending.resolve(created)); expect(await screen.findByRole("heading", { name: "Route created" })).toBeTruthy();
  });
  it("starts a new empty form only after an explicit Add another route action", async () => {
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    fireEvent.click(await screen.findByRole("button", { name: "Add another route" })); await ready();
    expect((screen.getByLabelText("Route number") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Official V-grade") as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getByLabelText("Route number")); expect(createCompetitionRoute).toHaveBeenCalledOnce();
  });
  it("retains duplicate entries, focuses the route number and allows a corrected save", async () => {
    const message = "This competition already has a route with this number.";
    vi.mocked(createCompetitionRoute).mockRejectedValueOnce(new ApiError(409, "ROUTE_EXISTS", message, { routeNumber: message }));
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    await waitFor(() => expect(screen.getByLabelText("Route number").getAttribute("aria-invalid")).toBe("true"));
    expect(document.activeElement).toBe(screen.getByLabelText("Route number"));
    expect((screen.getByLabelText("Route name") as HTMLInputElement).value).toBe(" Summit Traverse ");
    expect(screen.queryByRole("heading", { name: "Route created" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Route number"), { target: { value: "A9" } }); fireEvent.submit(form);
    expect(await screen.findByRole("heading", { name: "Route created" })).toBeTruthy(); expect(createCompetitionRoute).toHaveBeenCalledTimes(2);
  });
  it("shows server field validation and ignores unrecognized internal fields", async () => {
    vi.mocked(createCompetitionRoute).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Check route details.", { grade: "Enter an official V-grade.", privateField: "database secret" }));
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    expect(await screen.findByText("Enter an official V-grade.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Official V-grade")); expect(screen.queryByText("database secret")).toBeNull();
  });
  it.each([
    new ApiError(0, "NETWORK_ERROR", "private connection failure"),
    new ApiError(0, "TIMEOUT", "private timeout"),
    new ApiError(503, "INTERNAL_ERROR", "private database failure"),
    new Error("private crash"),
  ])("retains input when a save cannot be confirmed (%s)", async error => {
    vi.mocked(createCompetitionRoute).mockRejectedValueOnce(error);
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    expect(await screen.findByText(/Couldn't confirm the save/)).toBeTruthy();
    expect((screen.getByLabelText("Route name") as HTMLInputElement).value).toBe(" Summit Traverse ");
    expect(screen.queryByRole("heading", { name: "Route created" })).toBeNull(); expect(screen.queryByText(/private/)).toBeNull();
    expect(createCompetitionRoute).toHaveBeenCalledOnce(); expect(document.activeElement?.getAttribute("role")).toBe("alert");
  });
  it.each([401, 403, 404])("removes private form data if access is lost during a save (%s)", async status => {
    vi.mocked(createCompetitionRoute).mockRejectedValueOnce(new ApiError(status, status === 404 ? "COMPETITION_NOT_FOUND" : "ACCESS_DENIED", "Your gym access is unavailable."));
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    expect(await screen.findByText("Your gym access is unavailable.")).toBeTruthy(); expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByText("Autumn Open")).toBeNull();
  });
  it("aborts pending reads and ignores a late result when selecting another competition", async () => {
    const pending = deferred<ManagedCompetitionDetails>(); vi.mocked(getManagedCompetition).mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...competition, _id: otherId, name: "Second event" });
    renderPage(); await screen.findByText("Loading selected competition…");
    const signal = vi.mocked(getManagedCompetition).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Select other competition" })); await ready();
    await act(async () => pending.resolve(competition));
    expect(signal?.aborted).toBe(true); expect(screen.queryByText("Autumn Open")).toBeNull();
    fill(); fireEvent.submit(await ready());
    expect(createCompetitionRoute).toHaveBeenCalledWith(otherId, expect.any(Object), expect.any(AbortSignal));
  });
  it("aborts pending writes and does not show their success in the next competition", async () => {
    const pending = deferred<CreatedRoute>(); vi.mocked(createCompetitionRoute).mockReturnValueOnce(pending.promise);
    renderPage(); const form = await ready(); fill(); fireEvent.submit(form);
    const signal = vi.mocked(createCompetitionRoute).mock.calls[0][2];
    vi.mocked(getManagedCompetition).mockResolvedValueOnce({ ...competition, _id: otherId, name: "Second event" });
    fireEvent.click(screen.getByRole("button", { name: "Select other competition" })); await ready();
    await act(async () => pending.resolve(created));
    expect(signal?.aborted).toBe(true); expect(screen.queryByRole("heading", { name: "Route created" })).toBeNull();
    expect((screen.getByLabelText("Route name") as HTMLInputElement).value).toBe("");
  });
});
