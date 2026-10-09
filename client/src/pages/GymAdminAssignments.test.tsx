import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GymDetailsPage from "./GymDetailsPage.tsx";
import { assignGymAdmin, removeGymAdmin, getGym, updateGym, deactivateGym, type GymDetails } from "../lib/gymsApi.ts";
import { ApiError } from "../lib/apiClient.ts";

let role = "ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: role === "VISITOR" ? null : { userId: "system-admin", role, email: "admin@example.com" } }),
}));
vi.mock("../lib/gymsApi.ts", () => ({ getGym: vi.fn(), updateGym: vi.fn(), deactivateGym: vi.fn(), assignGymAdmin: vi.fn(), removeGymAdmin: vi.fn() }));
const gymId = "507f1f77bcf86cd799439011";
const otherGymId = "507f1f77bcf86cd799439012";
const alex = { userId: "507f1f77bcf86cd799439013", firstName: "Alex", lastName: "Lee", email: "alex@example.com" };
const jordan = { userId: "507f1f77bcf86cd799439014", firstName: "Jordan", lastName: "Smith", email: "jordan@example.com" };
const gym: GymDetails = { gymId, name: "Summit", location: "Toronto", status: "ACTIVE", administrators: [alex] };

function openPage() {
  return render(<MemoryRouter initialEntries={[`/admin/gyms/${gymId}`]}>
    <Link to={`/admin/gyms/${otherGymId}`}>Open another gym</Link>
    <Routes><Route path="/admin/gyms/:gymId" element={<GymDetailsPage />} /></Routes>
  </MemoryRouter>);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function enterId(id = jordan.userId) {
  const input = await screen.findByLabelText("Gym Administrator user ID");
  fireEvent.change(input, { target: { value: id } });
  return input;
}
function assign() { fireEvent.submit(screen.getByRole("form", { name: "Assign Gym Administrator" })); }
async function chooseRemoval() { fireEvent.click(await screen.findByRole("button", { name: "Remove Alex Lee from this gym" })); }
function admins() { return within(screen.getByRole("region", { name: "Gym administrators" })); }

beforeEach(() => {
  role = "ADMIN";
  vi.mocked(getGym).mockReset().mockResolvedValue(gym);
  vi.mocked(assignGymAdmin).mockReset().mockResolvedValue({ ...gym, administrators: [alex, jordan] });
  vi.mocked(removeGymAdmin).mockReset().mockResolvedValue({ ...gym, administrators: [] });
  vi.mocked(updateGym).mockReset().mockResolvedValue(gym);
  vi.mocked(deactivateGym).mockReset().mockResolvedValue({ ...gym, status: "INACTIVE" });
});
afterEach(cleanup);

describe("US-006 #36/#37, FR-003, AC-006", () => {
  it("lists real assigned names/emails and offers each administrator a scoped remove action", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, administrators: [alex, jordan] });
    openPage(); await screen.findByText("Jordan Smith");
    expect(admins().getByText("2 assigned")).toBeTruthy();
    expect(admins().getByText("alex@example.com")).toBeTruthy();
    expect(admins().getByRole("button", { name: "Remove Jordan Smith from this gym" })).toBeTruthy();
    expect(assignGymAdmin).not.toHaveBeenCalled();
    expect(removeGymAdmin).not.toHaveBeenCalled();
  });
  it("assigns a trimmed account ID to only the selected gym and updates the confirmed list/count", async () => {
    openPage(); const input = await enterId(` ${jordan.userId.toUpperCase()} `); assign();
    await screen.findByText("Gym Administrator assigned to Summit.");
    expect(assignGymAdmin).toHaveBeenCalledExactlyOnceWith(gymId, jordan.userId, expect.any(AbortSignal));
    expect(admins().getByText("Jordan Smith")).toBeTruthy();
    expect(admins().getByText("2 assigned")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(updateGym).not.toHaveBeenCalled();
    expect(deactivateGym).not.toHaveBeenCalled();
  });
  it.each(["", "invalid", "507f1f77bcf86cd79943901z", "x".repeat(25)])("blocks malformed user ID %j before a write", async id => {
    openPage(); const input = await enterId(id); assign();
    expect(screen.getByRole("alert").textContent).toContain(id ? "24-character" : "Enter a Gym Administrator");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("gym-admin-id-error");
    expect(document.activeElement).toBe(input);
    expect(assignGymAdmin).not.toHaveBeenCalled();
  });
  it("prevents an already assigned user from being submitted again, including uppercase IDs", async () => {
    openPage(); await enterId(alex.userId.toUpperCase()); assign();
    expect(screen.getByRole("alert").textContent).toContain("already assigned");
    expect(assignGymAdmin).not.toHaveBeenCalled();
    expect(admins().getByText("1 assigned")).toBeTruthy();
  });
  it.each([
    [403, "GYM_ADMIN_NOT_APPROVED", "Choose an approved Gym Administrator"],
    [409, "GYM_ADMIN_REQUIRED", "Choose an active Gym Administrator account."],
    [404, "USER_NOT_FOUND", "Check the user ID"],
    [403, "ROLE_FORBIDDEN", "Administrator access required."],
  ])("keeps existing assignments and entered ID after API %s/%s", async (status, code, message) => {
    vi.mocked(assignGymAdmin).mockRejectedValue(new ApiError(Number(status), String(code), String(message)));
    openPage(); const input = await enterId(); assign();
    expect((await screen.findByRole("alert")).textContent).toContain(String(message));
    expect((input as HTMLInputElement).value).toBe(jordan.userId);
    expect(admins().getByText("1 assigned")).toBeTruthy();
    expect(admins().queryByText("Jordan Smith")).toBeNull();
    expect(screen.queryByText(/Administrator assigned to Summit/)).toBeNull();
    expect(assignGymAdmin).toHaveBeenCalledTimes(1);
  });
  it("shows a safe failure without exposing an unexpected exception and lets the user retry", async () => {
    vi.mocked(assignGymAdmin).mockRejectedValueOnce(new Error("secret internal details"));
    openPage(); await enterId(); assign();
    expect((await screen.findByRole("alert")).textContent).toContain("Could not update this gym's administrators");
    expect(screen.queryByText(/secret internal/)).toBeNull();
    assign(); await screen.findByText("Jordan Smith");
    expect(assignGymAdmin).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not add a user optimistically and locks all writes/refresh until assignment completes", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(assignGymAdmin).mockReturnValueOnce(pending.promise);
    openPage(); await enterId(); assign(); assign();
    expect(assignGymAdmin).toHaveBeenCalledTimes(1);
    expect(admins().queryByText("Jordan Smith")).toBeNull();
    for (const name of ["Edit gym", "Deactivate gym", "Refresh details", "Assigning…", "Remove Alex Lee from this gym"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    await act(async () => pending.resolve({ ...gym, administrators: [alex, jordan] }));
    expect(admins().getByText("2 assigned")).toBeTruthy();
  });
  it("asks for removal confirmation and cancels without deleting an assignment", async () => {
    openPage(); await chooseRemoval();
    expect(screen.getByText("Remove Alex Lee from Summit?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm removal" })).toBe(document.activeElement);
    expect(removeGymAdmin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel removal" }));
    expect(screen.queryByRole("group", { name: "Confirm administrator removal" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Alex Lee from this gym" })).toBe(document.activeElement);
    expect(removeGymAdmin).not.toHaveBeenCalled();
  });
  it("removes only the chosen relationship and keeps other administrators in the returned list", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, administrators: [alex, jordan] });
    vi.mocked(removeGymAdmin).mockResolvedValue({ ...gym, administrators: [jordan] });
    openPage(); await chooseRemoval(); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("Gym Administrator removed from Summit.");
    expect(removeGymAdmin).toHaveBeenCalledExactlyOnceWith(gymId, alex.userId, expect.any(AbortSignal));
    expect(admins().queryByText("Alex Lee")).toBeNull();
    expect(admins().getByText("Jordan Smith")).toBeTruthy();
    expect(admins().getByText("1 assigned")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Confirm administrator removal" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Gym Administrator user ID")));
  });
  it("shows the true empty list after the last administrator is removed", async () => {
    openPage(); await chooseRemoval(); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByText("No gym administrators assigned")).toBeTruthy();
    expect(admins().getByText("0 assigned")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assign administrator" })).toBeTruthy();
  });
  it("preserves the list and confirmation after a failed removal", async () => {
    vi.mocked(removeGymAdmin).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Please try again."));
    openPage(); await chooseRemoval(); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Please try again.");
    expect(admins().getByText("Alex Lee")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm removal" })).toBeTruthy();
    expect(removeGymAdmin).toHaveBeenCalledTimes(1);
  });
  it("blocks overlapping removal requests and does not hide a user before the server confirms", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(removeGymAdmin).mockReturnValueOnce(pending.promise);
    openPage(); await chooseRemoval(); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    fireEvent.click(screen.getByRole("button", { name: "Removing…" }));
    expect(removeGymAdmin).toHaveBeenCalledTimes(1);
    expect(admins().getByText("Alex Lee")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Assign administrator" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ...gym, administrators: [] }));
  });
  it("refreshes the saved list after assigning an administrator", async () => {
    vi.mocked(getGym).mockResolvedValueOnce(gym).mockResolvedValueOnce({ ...gym, administrators: [alex, jordan] });
    openPage(); await enterId(); assign(); await screen.findByText("Jordan Smith");
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
    expect(await screen.findByText("Jordan Smith")).toBeTruthy();
    expect(admins().getByText("2 assigned")).toBeTruthy();
    expect(screen.queryByText("Gym Administrator assigned to Summit.")).toBeNull();
  });
  it("disables assignment changes while editing or confirming gym deactivation", async () => {
    openPage(); await screen.findByText("Alex Lee");
    fireEvent.click(screen.getByRole("button", { name: "Edit gym" }));
    expect((screen.getByLabelText("Gym Administrator user ID") as HTMLInputElement).disabled).toBe(true);
    assign(); expect(assignGymAdmin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate gym" }));
    expect((screen.getByRole("button", { name: "Remove Alex Lee from this gym" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["assign", "remove"] as const)("ignores a late %s response after another gym is selected", async operation => {
    const pending = deferred<GymDetails>();
    vi.mocked(operation === "assign" ? assignGymAdmin : removeGymAdmin).mockReturnValueOnce(pending.promise);
    vi.mocked(getGym).mockResolvedValueOnce(gym).mockResolvedValueOnce({ ...gym, gymId: otherGymId, name: "Other Gym", administrators: [] });
    openPage();
    if (operation === "assign") { await enterId(); assign(); }
    else { await chooseRemoval(); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" })); }
    const signal = vi.mocked(operation === "assign" ? assignGymAdmin : removeGymAdmin).mock.calls[0][2]!;
    fireEvent.click(screen.getByRole("link", { name: "Open another gym" }));
    await screen.findByRole("heading", { name: "Other Gym" });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ...gym, administrators: [alex, jordan] }));
    expect(admins().getByText("0 assigned")).toBeTruthy();
    expect(admins().queryByText("Alex Lee")).toBeNull();
    expect(screen.queryByText(/Administrator (assigned to|removed from) Summit/)).toBeNull();
  });
  it("hides unavailable gym controls after a GYM_NOT_FOUND mutation response", async () => {
    vi.mocked(assignGymAdmin).mockRejectedValue(new ApiError(404, "GYM_NOT_FOUND", "Gym not found."));
    openPage(); await enterId(); assign();
    expect((await screen.findByRole("alert")).textContent).toContain("This gym could not be found");
    expect(screen.queryByRole("form", { name: "Assign Gym Administrator" })).toBeNull();
  });
  it.each(["GYM_ADMIN", "CLIMBER", "VISITOR"])("denies %s before any gym read or write", otherRole => {
    role = otherRole; openPage();
    expect(screen.getByRole("heading", { name: "Administrator access required" })).toBeTruthy();
    expect(getGym).not.toHaveBeenCalled();
    expect(assignGymAdmin).not.toHaveBeenCalled();
    expect(removeGymAdmin).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "Assign Gym Administrator" })).toBeNull();
  });
});
