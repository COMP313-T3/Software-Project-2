import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getAdminUser, type UserDetails } from "../lib/userAdminApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/userAdminApi.ts", async original => ({ ...await original<typeof import("../lib/userAdminApi.ts")>(), getAdminUser: vi.fn() }));
const id = "507f1f77bcf86cd799439011", otherId = "507f1f77bcf86cd799439019";
const account: UserDetails = {
  _id: id, firstName: "Cara", lastName: "Lee", email: "cara@example.com", role: "CLIMBER", roleLabel: "Climber", isActive: true, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z", phone: "4165550101",
  climber: { dateOfBirth: "2005-09-11", gender: "PREFER_NOT_TO_SAY", address: "1 Test Street", postalCode: "M1A 1A1", country: "CA", hasSavedLocation: true, termsVersion: "v1", termsAcceptedAt: "2026-10-01T12:00:00Z", registrationCount: 4 }, gymAdmin: null,
};
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate("/admin/users/" + otherId)}>Select another account</button>; }
function renderPage() { return render(<MemoryRouter initialEntries={["/admin/users/" + id + "?q=Cara&role=CLIMBER"]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.mocked(getAdminUser).mockReset().mockResolvedValue(structuredClone(account));
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "system-admin", role: "ADMIN", token: "test-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "system-admin", email: "admin@example.com", role: "ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-008 selection and US-009 selected account information", () => {
  it("shows the selected account and Climber information from its API", async () => {
    renderPage(); await screen.findByRole("region", { name: "Selected user account" });
    expect(screen.getByRole("heading", { name: "Cara Lee" })).toBeTruthy(); expect(screen.getByText(account._id)).toBeTruthy(); expect(screen.getByText(account.email)).toBeTruthy();
    expect(screen.getByText("Competition registrations").nextElementSibling?.textContent).toBe("4"); expect(screen.getByText("Prefer not to say")).toBeTruthy(); expect(screen.getByText(/Sep 11, 2005/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit information" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deactivate account" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Role changes are currently unavailable.")).toBeTruthy();
  });
  it("shows an inactive Gym Administrator and their actual assigned gyms", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce({ ...account, role: "GYM_ADMIN", roleLabel: "Gym Administrator", isActive: false, climber: null, gymAdmin: { gyms: [{ _id: otherId, name: "Assigned gym", status: "INACTIVE" }] } }); renderPage();
    await screen.findByRole("region", { name: "Assigned gyms" }); expect(screen.getByText("Deactivated")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Assigned gym" }).getAttribute("href")).toBe("/admin/gyms/" + otherId); expect(screen.queryByRole("region", { name: "Climber profile" })).toBeNull();
  });
  it("explains an account without assigned gyms", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce({ ...account, role: "GYM_ADMIN", roleLabel: "Gym Administrator", climber: null, gymAdmin: { gyms: [] } }); renderPage();
    expect(await screen.findByText("No gyms are assigned to this account.")).toBeTruthy();
  });
  it("does not display a Climber or Gym Admin profile for a System Administrator", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce({ ...account, role: "ADMIN", roleLabel: "System Administrator", climber: null, gymAdmin: null }); renderPage();
    await screen.findByRole("region", { name: "Selected user account" }); expect(screen.queryByRole("region", { name: "Climber profile" })).toBeNull(); expect(screen.queryByRole("region", { name: "Assigned gyms" })).toBeNull();
  });
  it("uses readable missing-data labels and the account email when no name is saved", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce({ ...account, firstName: "", lastName: "", phone: null, climber: null }); renderPage();
    await screen.findByRole("region", { name: "Selected user account" }); expect(screen.getByRole("heading", { name: account.email })).toBeTruthy();
    expect(screen.getByText("Phone").nextElementSibling?.textContent).toBe("Not provided"); expect(screen.getByText("Climber profile information is unavailable.")).toBeTruthy();
  });
  it("loads fresh saved data on refresh and preserves the return filters", async () => {
    renderPage(); await screen.findByRole("region", { name: "Selected user account" });
    vi.mocked(getAdminUser).mockResolvedValueOnce({ ...account, isActive: false, phone: "4165550199" }); fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
    await screen.findByText("Deactivated"); expect(screen.getByText("4165550199")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to users" }).getAttribute("href")).toBe("/admin/users?q=Cara&role=CLIMBER");
  });
  it("shows loading without the previous account during refresh", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Cara Lee" }); const pending = deferred<UserDetails>(); vi.mocked(getAdminUser).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" })); expect(screen.getByText("Loading user details…")).toBeTruthy(); expect(screen.queryByText("cara@example.com")).toBeNull();
    await act(async () => pending.resolve(account)); await screen.findByRole("heading", { name: "Cara Lee" });
  });
  it.each([400, 401, 403, 404])("handles rejected selected-account reads (%s) without displaying another user", async status => {
    vi.mocked(getAdminUser).mockRejectedValueOnce(new ApiError(status, "USER_UNAVAILABLE", "Account unavailable.")); renderPage();
    await screen.findByRole("alert"); expect(screen.queryByRole("region", { name: "Selected user account" })).toBeNull();
    if (status === 401) expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
  it("shows a safe error and retries instead of revealing internal server details", async () => {
    vi.mocked(getAdminUser).mockRejectedValueOnce(new Error("private credentials")); renderPage();
    await screen.findByText("Couldn't load this user. Please try again."); expect(screen.queryByText("private credentials")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByRole("heading", { name: "Cara Lee" });
  });
  it("removes private details after a refresh is forbidden", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Cara Lee" }); vi.mocked(getAdminUser).mockRejectedValueOnce(new ApiError(403, "ROLE_FORBIDDEN", "Access denied."));
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" })); await screen.findByText("Access denied."); expect(screen.queryByText("1 Test Street")).toBeNull();
  });
  it("ignores and cancels a late response for an account that is no longer selected", async () => {
    const pending = deferred<UserDetails>(); vi.mocked(getAdminUser).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...account, _id: otherId, firstName: "Another", lastName: "Account" });
    renderPage(); await screen.findByText("Loading user details…"); const signal = vi.mocked(getAdminUser).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Select another account" })); await screen.findByRole("heading", { name: "Another Account" });
    await act(async () => pending.resolve(account)); expect(signal?.aborted).toBe(true); expect(screen.queryByRole("heading", { name: "Cara Lee" })).toBeNull();
  });
  it.each(["CLIMBER", "GYM_ADMIN"] as const)("blocks %s before a private detail read", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } }); renderPage();
    await screen.findByRole("heading", { name: "System Administrator access required" }); expect(getAdminUser).not.toHaveBeenCalled();
  });
  it("marks the Users navigation section and retains the search link", async () => {
    renderPage(); await screen.findByRole("region", { name: "Selected user account" });
    const users = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Users" });
    expect(users.getAttribute("aria-current")).toBe("true"); expect(users.getAttribute("href")).toBe("/admin/users?q=Cara&role=CLIMBER");
  });
});
