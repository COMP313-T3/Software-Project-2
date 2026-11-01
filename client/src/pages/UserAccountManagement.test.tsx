import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import { getAdminUser, type UserDetails } from "../lib/userAdminApi.ts";
import { deactivateUserAccount, updateUserProfile } from "../lib/userAccountApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";
vi.mock("../lib/userAdminApi.ts", async original => ({ ...await original<typeof import("../lib/userAdminApi.ts")>(), getAdminUser: vi.fn() }));
vi.mock("../lib/userAccountApi.ts", () => ({ updateUserProfile: vi.fn(), deactivateUserAccount: vi.fn() }));
const id = "507f1f77bcf86cd799439011", otherId = "507f1f77bcf86cd799439019";
const account: UserDetails = { _id: id, firstName: "Cara", lastName: "Lee", email: "cara@example.com", phone: "4165550101", role: "CLIMBER", roleLabel: "Climber", isActive: true, createdAt: "2026-01-01", updatedAt: "2026-10-01", climber: { dateOfBirth: "2000-02-20", gender: "FEMALE", address: "1 Test Street", postalCode: "M5V 2T6", country: "CA", hasSavedLocation: true, registrationCount: 4, termsVersion: "v1", termsAcceptedAt: "2026-01-01" }, gymAdmin: null };
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate("/admin/users/" + otherId)}>Select another account</button>; }
function renderPage() { return render(<MemoryRouter initialEntries={["/admin/users/" + id + "?q=Cara&role=CLIMBER"]}><Navigation /><App /></MemoryRouter>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function edit() { await screen.findByRole("heading", { name: "Cara Lee" }); fireEvent.click(screen.getByRole("button", { name: "Edit information" })); return screen.getByRole("form", { name: "Edit user information" }); }
async function reviewName() { const form = await edit(); fireEvent.change(within(form).getByLabelText("First name"), { target: { value: "Jordan" } }); fireEvent.click(within(form).getByRole("button", { name: "Review changes" })); return screen.findByRole("alertdialog"); }
beforeEach(() => {
  vi.mocked(getAdminUser).mockReset().mockResolvedValue(structuredClone(account));
  vi.mocked(updateUserProfile).mockReset().mockResolvedValue({ userId: id, isActive: true });
  vi.mocked(deactivateUserAccount).mockReset().mockResolvedValue({ userId: id, isActive: false });
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "system-admin", role: "ADMIN", token: "test-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "system-admin", email: "admin@example.com", role: "ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("US-009 selected profile editing and status controls", () => {
  it("prefills only editable fields and keeps role/permission changes unavailable", async () => {
    renderPage(); const form = await edit();
    expect((within(form).getByLabelText("First name") as HTMLInputElement).value).toBe("Cara");
    expect((within(form).getByLabelText("Country") as HTMLSelectElement).value).toBe("CA");
    expect(screen.getByLabelText("Current role").hasAttribute("readonly")).toBe(true);
    expect(screen.queryByRole("combobox", { name: /role|permission/i })).toBeNull();
    expect(within(form).queryByLabelText(/password/i)).toBeNull();
  });
  it("cancels editing without a write", async () => {
    renderPage(); const form = await edit(); fireEvent.click(within(form).getByRole("button", { name: "Cancel editing" }));
    expect(screen.queryByRole("form", { name: "Edit user information" })).toBeNull(); expect(updateUserProfile).not.toHaveBeenCalled();
  });
  it("requires a change and validates required fields before opening a confirmation", async () => {
    renderPage(); const form = await edit(); fireEvent.click(within(form).getByRole("button", { name: "Review changes" }));
    expect(screen.getByText("Change at least one account detail before saving.")).toBeTruthy();
    fireEvent.change(within(form).getByLabelText("First name"), { target: { value: " " } }); fireEvent.click(within(form).getByRole("button", { name: "Review changes" }));
    expect(within(form).getByLabelText("First name").getAttribute("aria-invalid")).toBe("true"); expect(screen.queryByRole("alertdialog")).toBeNull(); expect(updateUserProfile).not.toHaveBeenCalled();
  });
  it("reviews the exact changes, focuses Cancel, and allows cancellation without saving", async () => {
    renderPage(); const dialog = await reviewName(); expect(within(dialog).getByText("Jordan")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); expect(updateUserProfile).not.toHaveBeenCalled();
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jordan");
  });
  it("saves only selected-user changes, reloads authoritative details and preserves the return filters", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, firstName: "Jordan" }); renderPage(); const dialog = await reviewName();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm save" })); await screen.findByText("Account information saved.");
    expect(updateUserProfile).toHaveBeenCalledExactlyOnceWith(id, { firstName: "Jordan" }, expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "Jordan Lee" })).toBeTruthy(); expect(getAdminUser).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "Back to users" }).getAttribute("href")).toBe("/admin/users?q=Cara&role=CLIMBER");
  });
  it("sends a profile field and explicit saved-pin removal without registration or role fields", async () => {
    renderPage(); const form = await edit(); fireEvent.change(within(form).getByLabelText("Address"), { target: { value: "2 Test Street" } }); fireEvent.click(within(form).getByLabelText("Clear the saved map pin"));
    fireEvent.click(within(form).getByRole("button", { name: "Review changes" })); const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Clear saved pin")).toBeTruthy(); fireEvent.click(within(dialog).getByRole("button", { name: "Confirm save" })); await screen.findByText("Account information saved.");
    expect(updateUserProfile).toHaveBeenCalledWith(id, { address: "2 Test Street", location: null }, expect.any(AbortSignal));
  });
  it("keeps the form draft and highlights an email conflict from the API", async () => {
    vi.mocked(updateUserProfile).mockRejectedValueOnce(new ApiError(409, "EMAIL_TAKEN", "This email already has an account. Try another email.", { email: "Email already used." }));
    renderPage(); const form = await edit(); fireEvent.change(within(form).getByLabelText("Email"), { target: { value: "taken@example.com" } }); fireEvent.click(within(form).getByRole("button", { name: "Review changes" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirm save" })); await screen.findByText("Email already used.");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("taken@example.com"); expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    expect(getAdminUser).toHaveBeenCalledTimes(1); expect(screen.queryByText("Account information saved.")).toBeNull();
  });
  it("ignores repeated confirmation clicks and Escape while a save is processing", async () => {
    const pending = deferred<{ userId: string; isActive: boolean }>(); vi.mocked(updateUserProfile).mockReturnValueOnce(pending.promise);
    renderPage(); const dialog = await reviewName(); const confirm = within(dialog).getByRole("button", { name: "Confirm save" });
    fireEvent.click(confirm); fireEvent.click(confirm); fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(updateUserProfile).toHaveBeenCalledTimes(1); expect(screen.getByRole("alertdialog")).toBeTruthy(); expect(screen.getByRole("button", { name: "Refresh details" }).hasAttribute("disabled")).toBe(true);
    await act(async () => pending.resolve({ userId: id, isActive: true })); await screen.findByText("Account information saved.");
  });
  it.each([new ApiError(0, "TIMEOUT", "timeout"), new ApiError(500, "PRIVATE", "secret stack"), new Error("wrong response ID")])("requires a fresh read after an uncertain write %#", async error => {
    vi.mocked(updateUserProfile).mockRejectedValueOnce(error); renderPage(); const dialog = await reviewName();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm save" })); await screen.findByText("Couldn't confirm whether the change was saved. Refresh details before trying another action.");
    expect(screen.queryByText("secret stack")).toBeNull(); expect(screen.getByRole("button", { name: "Deactivate account" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Review changes" }).closest("fieldset")?.disabled).toBe(true); expect(updateUserProfile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" })); await screen.findByRole("heading", { name: "Cara Lee" }); expect(screen.getByRole("button", { name: "Edit information" }).hasAttribute("disabled")).toBe(false);
  });
  it("does not claim refreshed details when the save succeeds but the follow-up read fails", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce(account).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "network")); renderPage(); const dialog = await reviewName();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm save" })); await screen.findByText("The change was saved, but the latest account details couldn't be confirmed. Refresh details before another action.");
    expect(screen.queryByRole("region", { name: "Selected user account" })).toBeNull(); expect(updateUserProfile).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404])("hides private data and all mutation controls after a refused write (%s)", async status => {
    vi.mocked(updateUserProfile).mockRejectedValueOnce(new ApiError(status, "DENIED", "Account unavailable.")); renderPage(); const dialog = await reviewName();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm save" })); await screen.findByText("Account unavailable.");
    expect(screen.queryByText("1 Test Street")).toBeNull(); expect(screen.queryByRole("button", { name: "Deactivate account" })).toBeNull();
    if (status === 401) expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
  it("confirms deactivation with the selected name and keeps account records visible after the fresh read", async () => {
    vi.mocked(getAdminUser).mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, isActive: false }); renderPage(); await screen.findByRole("heading", { name: "Cara Lee" });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" })); const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Deactivate Cara Lee?" })).toBeTruthy(); expect(within(dialog).getByText(/competition records will be kept/)).toBeTruthy(); expect(deactivateUserAccount).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm deactivation" })); await screen.findByText("Account deactivated. The user's sessions have ended.");
    expect(deactivateUserAccount).toHaveBeenCalledExactlyOnceWith(id, expect.any(AbortSignal)); expect(screen.getByText("Deactivated")).toBeTruthy(); expect(screen.getByText("1 Test Street")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deactivate account" }).hasAttribute("disabled")).toBe(true);
  });
  it("cancels deactivation without sending any mutation", async () => {
    renderPage(); await screen.findByRole("heading", { name: "Cara Lee" }); fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" })); expect(deactivateUserAccount).not.toHaveBeenCalled();
  });
  it("requires refreshed status after an already-inactive conflict", async () => {
    vi.mocked(deactivateUserAccount).mockRejectedValueOnce(new ApiError(409, "USER_ALREADY_INACTIVE", "This account is already inactive.")); renderPage(); await screen.findByRole("heading", { name: "Cara Lee" });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" })); fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirm deactivation" }));
    await screen.findByText("This account is already inactive."); expect(screen.getByRole("button", { name: "Deactivate account" }).hasAttribute("disabled")).toBe(true); expect(deactivateUserAccount).toHaveBeenCalledTimes(1);
  });
  it.each(["ADMIN", "GYM_ADMIN"] as const)("shows only common editable information for %s", async role => {
    vi.mocked(getAdminUser).mockResolvedValue({ ...account, role, climber: null, gymAdmin: role === "GYM_ADMIN" ? { gyms: [] } : null }); renderPage(); const form = await edit();
    expect(within(form).queryByLabelText("Date of birth")).toBeNull(); expect(within(form).getByLabelText("Phone")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deactivate account" }).hasAttribute("disabled")).toBe(role === "ADMIN");
  });
  it("prevents self-deactivation", async () => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: id, email: "admin@example.com", role: "ADMIN", session: { expiresIn: 3600, limitReached: false } }); renderPage(); await screen.findByRole("heading", { name: "Cara Lee" });
    expect(screen.getByText("You cannot deactivate your own account.")).toBeTruthy(); expect(screen.getByRole("button", { name: "Deactivate account" }).hasAttribute("disabled")).toBe(true);
  });
  it("does not apply a late save response to another selected account", async () => {
    const pending = deferred<{ userId: string; isActive: boolean }>(); vi.mocked(updateUserProfile).mockReturnValueOnce(pending.promise); renderPage(); const dialog = await reviewName();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm save" })); const signal = vi.mocked(updateUserProfile).mock.calls[0][2];
    vi.mocked(getAdminUser).mockResolvedValueOnce({ ...account, _id: otherId, firstName: "Another" }); fireEvent.click(screen.getByRole("button", { name: "Select another account" })); await screen.findByRole("heading", { name: "Another Lee" });
    await act(async () => pending.resolve({ userId: id, isActive: true })); expect(signal?.aborted).toBe(true); expect(screen.queryByText("Account information saved.")).toBeNull(); expect(getAdminUser).toHaveBeenCalledTimes(2);
  });
});
