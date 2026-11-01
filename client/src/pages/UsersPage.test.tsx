import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { DEFAULT_USER_FILTERS, getAdminUser, getUserFilterOptions, listAdminUsers, type UserDetails, type UserFilterOptions, type UserPage } from "../lib/userAdminApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/userAdminApi.ts", async original => ({ ...await original<typeof import("../lib/userAdminApi.ts")>(), listAdminUsers: vi.fn(), getUserFilterOptions: vi.fn(), getAdminUser: vi.fn() }));
const id = "507f1f77bcf86cd799439011", gymId = "507f1f77bcf86cd799439022";
const users: UserPage["users"] = [
  { _id: id, firstName: "Cara", lastName: "Lee", email: "cara@example.com", role: "CLIMBER", roleLabel: "Climber", isActive: true, createdAt: "2026-10-01T12:00:00Z", gyms: [] },
  { _id: "507f1f77bcf86cd799439012", firstName: "Brian", lastName: "Setter", email: "setter@example.com", role: "GYM_ADMIN", roleLabel: "Gym Administrator", isActive: false, createdAt: "2026-09-01T12:00:00Z", gyms: [{ _id: gymId, name: "Brian Test Gym", status: "ACTIVE" }] },
];
const page: UserPage = { users, total: 2, page: 1, limit: 20 };
const options: UserFilterOptions = {
  roles: [{ value: "ADMIN", label: "System Administrator" }, { value: "GYM_ADMIN", label: "Gym Administrator" }, { value: "CLIMBER", label: "Climber" }],
  statuses: [{ value: "all", label: "All accounts" }, { value: "active", label: "Active" }, { value: "inactive", label: "Deactivated" }],
  sorts: [{ value: "name", label: "Name (A to Z)" }, { value: "email", label: "Email (A to Z)" }, { value: "newest", label: "Newest accounts first" }, { value: "oldest", label: "Oldest accounts first" }],
  gyms: [{ _id: gymId, name: "Brian Test Gym", status: "ACTIVE" }],
};
const account: UserDetails = { ...users[0], phone: "4165550101", updatedAt: "2026-10-20T12:00:00Z", climber: { dateOfBirth: "2005-09-11", gender: "PREFER_NOT_TO_SAY", address: "1 Test Street", postalCode: "M1A 1A1", country: "CA", hasSavedLocation: true, termsVersion: "v1", termsAcceptedAt: "2026-09-01T12:00:00Z", registrationCount: 4 }, gymAdmin: null };
function Navigation() {
  const navigate = useNavigate(), location = useLocation();
  return <><button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate(1)}>Browser forward</button><output aria-label="Current address">{location.pathname + location.search}</output></>;
}
function renderPage(url = "/admin/users") { return render(<MemoryRouter initialEntries={[url]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const rows = () => within(screen.getByRole("table")).getAllByRole("row");
beforeEach(() => {
  vi.mocked(listAdminUsers).mockReset().mockResolvedValue(structuredClone(page)); vi.mocked(getUserFilterOptions).mockReset().mockResolvedValue(structuredClone(options)); vi.mocked(getAdminUser).mockReset().mockResolvedValue(structuredClone(account));
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "system-admin", role: "ADMIN", token: "test-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "system-admin", email: "admin@example.com", role: "ADMIN", session: { expiresIn: 3600, limitReached: false } }); vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("US-008 / #146 user list and #147 supported search controls", () => {
  it("loads registered accounts with clear names, emails, roles, status and gym assignments", async () => {
    renderPage(); await screen.findByRole("table"); expect(rows()).toHaveLength(3);
    const cara = within(rows()[1]); expect(cara.getByText("Cara Lee")).toBeTruthy(); expect(cara.getByText("cara@example.com")).toBeTruthy(); expect(cara.getByText("Climber")).toBeTruthy(); expect(cara.getByText("Active")).toBeTruthy();
    const setter = within(rows()[2]); expect(setter.getByText("Deactivated")).toBeTruthy(); expect(setter.getByText("Brian Test Gym")).toBeTruthy();
    expect(listAdminUsers).toHaveBeenCalledWith(DEFAULT_USER_FILTERS, expect.any(AbortSignal));
    expect(getUserFilterOptions).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("gets role, status, gym and sort options from the backend, without offering VISITOR", async () => {
    renderPage(); await screen.findByRole("option", { name: "Brian Test Gym" });
    expect(within(screen.getByLabelText("Role")).getAllByRole("option").map(item => item.textContent)).toEqual(["All roles", ...options.roles.map(item => item.label)]);
    expect(screen.queryByRole("option", { name: "Visitor" })).toBeNull(); expect(screen.getByRole("option", { name: "Newest accounts first" })).toBeTruthy();
  });
  it("submits a name or email search and resets pagination", async () => {
    vi.mocked(listAdminUsers).mockResolvedValueOnce({ ...page, page: 3 }); renderPage("/admin/users?page=3"); await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "  Cara Lee  " } }); fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ ...DEFAULT_USER_FILTERS, q: "Cara Lee" }, expect.any(AbortSignal)));
    expect(screen.getByLabelText("Current address").textContent).toBe("/admin/users?q=Cara+Lee");
  });
  it.each([["Role", "role", "CLIMBER"], ["Account status", "status", "inactive"], ["Gym", "gymId", gymId], ["Sort by", "sort", "newest"], ["Users per page", "limit", 50]] as const)("applies %s through the API and resets to page one", async (label, field, value) => {
    renderPage(); await screen.findByRole("option", { name: "Brian Test Gym" }); fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
    await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ ...DEFAULT_USER_FILTERS, [field]: value }, expect.any(AbortSignal)));
  });
  it("combines filters and applies the typed query when a filter changes", async () => {
    renderPage(); await screen.findByRole("option", { name: "Brian Test Gym" });
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "Brian" } }); fireEvent.change(screen.getByLabelText("Role"), { target: { value: "GYM_ADMIN" } });
    await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ ...DEFAULT_USER_FILTERS, q: "Brian", role: "GYM_ADMIN" }, expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("Gym"), { target: { value: gymId } });
    await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ ...DEFAULT_USER_FILTERS, q: "Brian", role: "GYM_ADMIN", gymId }, expect.any(AbortSignal)));
  });
  it("clears applied search, filters, order and paging", async () => {
    renderPage("/admin/users?q=Cara&role=CLIMBER&status=active&sort=newest&page=2&limit=50"); await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" })); await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith(DEFAULT_USER_FILTERS, expect.any(AbortSignal)));
    expect((screen.getByLabelText("Search users") as HTMLInputElement).value).toBe("");
  });
  it("shows a no-results message and lets the Admin clear filters", async () => {
    vi.mocked(listAdminUsers).mockResolvedValueOnce({ ...page, users: [], total: 0 }); renderPage("/admin/users?q=missing");
    await screen.findByRole("heading", { name: "No users match your search" }); expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" })); await screen.findByRole("table");
  });
  it("distinguishes an empty platform from an empty filtered result", async () => {
    vi.mocked(listAdminUsers).mockResolvedValueOnce({ ...page, users: [], total: 0 }); renderPage(); await screen.findByRole("heading", { name: "No registered users yet" });
  });
  it("handles an out-of-range page after the result set shrinks", async () => {
    vi.mocked(listAdminUsers).mockResolvedValueOnce({ ...page, users: [], total: 2, page: 4 }); renderPage("/admin/users?page=4"); await screen.findByRole("heading", { name: "No users on this page" });
    fireEvent.click(screen.getByRole("button", { name: "Go to first page" })); await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith(DEFAULT_USER_FILTERS, expect.any(AbortSignal)));
  });
  it("pages through actual server totals while retaining the search", async () => {
    vi.mocked(listAdminUsers).mockResolvedValueOnce({ ...page, total: 21 }).mockResolvedValueOnce({ ...page, users: [users[1]], total: 21, page: 2 });
    renderPage("/admin/users?q=Lee"); await screen.findByRole("table"); expect(screen.getByRole("button", { name: "Previous page" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" })); await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ ...DEFAULT_USER_FILTERS, q: "Lee", page: 2 }, expect.any(AbortSignal)));
    await screen.findByText("Page 2 of 2"); expect(screen.getByRole("button", { name: "Next page" }).matches(":disabled")).toBe(true);
  });
  it("shows loading without exposing old rows during refresh", async () => {
    renderPage(); await screen.findByRole("table"); const pending = deferred<UserPage>(); vi.mocked(listAdminUsers).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Refresh users" })); expect(screen.getByText("Loading users…")).toBeTruthy(); expect(screen.queryByText("cara@example.com")).toBeNull();
    await act(async () => pending.resolve({ ...page, users: [users[1]], total: 1 })); await screen.findByRole("table"); expect(screen.queryByText("cara@example.com")).toBeNull();
  });
  it("ignores stale search responses and aborts them when a new search is applied", async () => {
    const pending = deferred<UserPage>(); vi.mocked(listAdminUsers).mockReturnValueOnce(pending.promise); renderPage(); await screen.findByText("Loading users…");
    const signal = vi.mocked(listAdminUsers).mock.calls[0][1]; fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "Brian" } }); fireEvent.submit(screen.getByRole("search"));
    await screen.findByRole("table"); await act(async () => pending.resolve({ ...page, users: [], total: 0 })); expect(signal?.aborted).toBe(true); expect(screen.getByRole("table")).toBeTruthy();
  });
  it("keeps query controls synchronized with browser Back and Forward", async () => {
    renderPage(); await screen.findByRole("table"); fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "Cara" } }); fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(screen.getByLabelText("Current address").textContent).toContain("q=Cara")); fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await waitFor(() => expect((screen.getByLabelText("Search users") as HTMLInputElement).value).toBe("")); fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
    await waitFor(() => expect((screen.getByLabelText("Search users") as HTMLInputElement).value).toBe("Cara"));
  });
  it("enforces the search length with readable feedback", async () => {
    renderPage(); await screen.findByRole("table"); const input = screen.getByLabelText("Search users");
    expect(input.getAttribute("maxlength")).toBe("100"); fireEvent.change(input, { target: { value: "x".repeat(101) } }); fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByText("Use 100 characters or fewer.")).toBeTruthy(); expect(listAdminUsers).toHaveBeenCalledOnce();
  });
  it("shows server field validation on the corresponding control", async () => {
    vi.mocked(listAdminUsers).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Check filters.", { role: "Choose a registered account role." })); renderPage("/admin/users?role=VISITOR");
    await screen.findByText("Choose a registered account role."); expect(screen.getByLabelText("Role").getAttribute("aria-invalid")).toBe("true"); expect(screen.queryByRole("table")).toBeNull();
  });
  it("keeps search usable when dropdown metadata fails, with a filter retry", async () => {
    vi.mocked(getUserFilterOptions).mockRejectedValueOnce(new Error("private metadata error")); renderPage();
    await screen.findByRole("table"); await screen.findByText("Couldn't load filter choices. Please try again."); expect(screen.getByLabelText("Role").matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry filter choices" })); await screen.findByRole("option", { name: "Brian Test Gym" }); expect(screen.queryByText("private metadata error")).toBeNull();
  });
  it.each([0, 500])("shows safe list errors instead of an empty result (%s)", async status => {
    vi.mocked(listAdminUsers).mockRejectedValueOnce(new ApiError(status, "INTERNAL", "private database detail")); renderPage();
    await screen.findByText("Couldn't load users. Please try again."); expect(screen.queryByText("private database detail")).toBeNull(); expect(screen.queryByRole("heading", { name: "No registered users yet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByRole("table");
  });
  it.each([401, 403])("removes private list and filter data after the server denies a refresh (%s)", async status => {
    renderPage(); await screen.findByRole("table"); vi.mocked(listAdminUsers).mockRejectedValueOnce(new ApiError(status, "ACCESS_DENIED", "Access denied."));
    fireEvent.click(screen.getByRole("button", { name: "Refresh users" })); await screen.findByText("Access denied.");
    expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByLabelText("Gym")).toBeNull(); if (status === 401) expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
  it("hides the list when the metadata endpoint denies access, even if the list read succeeds", async () => {
    vi.mocked(getUserFilterOptions).mockRejectedValueOnce(new ApiError(403, "ROLE_FORBIDDEN", "Access denied.")); renderPage();
    await screen.findByText("Access denied."); expect(screen.queryByText("cara@example.com")).toBeNull();
  });
  it("opens the selected user's details and returns to the exact applied filters", async () => {
    const search = "?q=Cara&role=CLIMBER&status=active&sort=newest&page=2&limit=50"; renderPage("/admin/users" + search); await screen.findByRole("table");
    fireEvent.click(screen.getByRole("link", { name: "View details for Cara Lee" })); await screen.findByRole("region", { name: "Selected user account" });
    expect(getAdminUser).toHaveBeenCalledWith(id, expect.any(AbortSignal)); expect(screen.getByText("1 Test Street")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit information" })).toBeTruthy();
    expect(screen.getByLabelText("Current role").hasAttribute("readonly")).toBe(true);
    expect(screen.getByRole("link", { name: "Back to users" }).getAttribute("href")).toBe("/admin/users" + search);
    fireEvent.click(screen.getByRole("link", { name: "Back to users" })); await screen.findByRole("table"); expect((screen.getByLabelText("Search users") as HTMLInputElement).value).toBe("Cara");
  });
  it.each(["CLIMBER", "GYM_ADMIN"] as const)("blocks %s before either private API is read", async role => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "other", email: "other@example.com", role, session: { expiresIn: 3600, limitReached: false } }); renderPage();
    await screen.findByRole("heading", { name: "System Administrator access required" }); expect(listAdminUsers).not.toHaveBeenCalled(); expect(getUserFilterOptions).not.toHaveBeenCalled();
  });
  it("sends a Visitor to login before private user reads", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: false }); renderPage(); await screen.findByRole("heading", { name: "Welcome back" });
    expect(listAdminUsers).not.toHaveBeenCalled(); expect(getUserFilterOptions).not.toHaveBeenCalled();
  });
});
