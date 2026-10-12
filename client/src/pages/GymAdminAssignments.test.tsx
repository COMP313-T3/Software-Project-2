import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GymDetailsPage from "./GymDetailsPage.tsx";
import {
  assignGymAdmin, removeGymAdmin, getGym, updateGym, deactivateGym, listAdminCandidates, getGymAdmin,
  type GymAdministrator, type GymAdministratorDetails, type GymDetails,
} from "../lib/gymsApi.ts";
import { ApiError } from "../lib/apiClient.ts";

let role = "ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: role === "VISITOR" ? null : { userId: "system-admin", role, email: "admin@example.com" } }),
}));
vi.mock("../lib/gymsApi.ts", () => ({
  getGym: vi.fn(), updateGym: vi.fn(), deactivateGym: vi.fn(), assignGymAdmin: vi.fn(), removeGymAdmin: vi.fn(),
  activateGym: vi.fn(), listAdminCandidates: vi.fn(), getGymAdmin: vi.fn(),
}));
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
function picker() { return screen.getByLabelText("Gym Administrator to assign") as HTMLSelectElement; }
async function choose(person: GymAdministrator = jordan) {
  await screen.findByRole("option", { name: `${person.firstName} ${person.lastName} (${person.email})` });
  fireEvent.change(picker(), { target: { value: person.userId } });
  return picker();
}
function assign() { fireEvent.submit(screen.getByRole("form", { name: "Assign Gym Administrator" })); }
async function chooseRemoval() { fireEvent.click(await screen.findByRole("button", { name: "Remove Alex Lee from this gym" })); }
function admins() { return within(screen.getByRole("region", { name: "Gym administrators" })); }

beforeEach(() => {
  role = "ADMIN";
  vi.mocked(getGym).mockReset().mockResolvedValue(gym);
  vi.mocked(listAdminCandidates).mockReset().mockResolvedValue([jordan]);
  vi.mocked(assignGymAdmin).mockReset().mockResolvedValue({ ...gym, administrators: [alex, jordan] });
  vi.mocked(removeGymAdmin).mockReset().mockResolvedValue({ ...gym, administrators: [] });
  vi.mocked(updateGym).mockReset().mockResolvedValue(gym);
  vi.mocked(deactivateGym).mockReset().mockResolvedValue({ ...gym, status: "INACTIVE" });
  vi.mocked(getGymAdmin).mockReset();
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
  it("offers only the accounts the server approved for this gym", async () => {
    vi.mocked(listAdminCandidates).mockResolvedValue([jordan, { userId: "507f1f77bcf86cd799439015", firstName: "Sam", lastName: "Park", email: "sam@example.com" }]);
    openPage(); await screen.findByRole("option", { name: "Sam Park (sam@example.com)" });
    expect(listAdminCandidates).toHaveBeenCalledExactlyOnceWith(gymId, expect.any(AbortSignal));
    const options = within(picker()).getAllByRole("option").map(option => option.textContent);
    expect(options).toEqual(["Choose an approved account", "Jordan Smith (jordan@example.com)", "Sam Park (sam@example.com)"]);
    expect(screen.queryByRole("textbox", { name: /user ID/i })).toBeNull();
  });
  it("says so when no approved accounts are waiting for this gym", async () => {
    vi.mocked(listAdminCandidates).mockResolvedValue([]);
    openPage();
    expect(await screen.findByText("No approved Gym Administrator accounts are waiting for this gym.")).toBeTruthy();
    assign();
    expect(screen.getByRole("alert").textContent).toBe("Choose a Gym Administrator to assign.");
    expect(assignGymAdmin).not.toHaveBeenCalled();
  });
  it("explains a failed list of approved accounts and loads it again on request", async () => {
    vi.mocked(listAdminCandidates).mockRejectedValueOnce(new Error("socket hang up"));
    openPage();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load the accounts approved for this gym");
    expect(screen.queryByText(/socket hang up/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("option", { name: "Jordan Smith (jordan@example.com)" });
    expect(listAdminCandidates).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("assigns the chosen account to only the selected gym and updates the confirmed list and count", async () => {
    openPage(); const select = await choose(); assign();
    await screen.findByText("Gym Administrator assigned to Summit.");
    expect(assignGymAdmin).toHaveBeenCalledExactlyOnceWith(gymId, jordan.userId, expect.any(AbortSignal));
    expect(admins().getByText("Jordan Smith")).toBeTruthy();
    expect(admins().getByText("2 assigned")).toBeTruthy();
    expect(select.value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(select));
    await waitFor(() => expect(listAdminCandidates).toHaveBeenCalledTimes(2));
    expect(updateGym).not.toHaveBeenCalled();
    expect(deactivateGym).not.toHaveBeenCalled();
  });
  it("takes an assigned account off the list straight away", async () => {
    const reload = deferred<GymAdministrator[]>();
    vi.mocked(listAdminCandidates).mockResolvedValueOnce([jordan]).mockReturnValueOnce(reload.promise);
    openPage(); await choose(); assign();
    await screen.findByText("Gym Administrator assigned to Summit.");
    expect(within(picker()).queryByRole("option", { name: /Jordan Smith/ })).toBeNull();
    await act(async () => reload.resolve([]));
  });
  it("asks for a choice before assigning", async () => {
    openPage(); await screen.findByRole("option", { name: "Jordan Smith (jordan@example.com)" }); assign();
    expect(screen.getByRole("alert").textContent).toBe("Choose a Gym Administrator to assign.");
    expect(picker().getAttribute("aria-invalid")).toBe("true");
    expect(picker().getAttribute("aria-describedby")).toContain("gym-admin-candidate-error");
    expect(document.activeElement).toBe(picker());
    expect(assignGymAdmin).not.toHaveBeenCalled();
  });
  it("prevents an already assigned account from being submitted again when the list is out of date", async () => {
    vi.mocked(listAdminCandidates).mockResolvedValue([alex, jordan]);
    openPage(); await choose(alex); assign();
    expect(screen.getByRole("alert").textContent).toContain("already assigned");
    expect(assignGymAdmin).not.toHaveBeenCalled();
    expect(admins().getByText("1 assigned")).toBeTruthy();
  });
  it.each([
    [403, "GYM_ADMIN_NOT_APPROVED", "Choose an approved Gym Administrator"],
    [409, "GYM_ADMIN_REQUIRED", "Choose an active Gym Administrator account."],
    [404, "USER_NOT_FOUND", "Refresh the page and try again"],
    [403, "ROLE_FORBIDDEN", "Administrator access required."],
  ])("keeps existing assignments and the chosen account after API %s/%s", async (status, code, message) => {
    vi.mocked(assignGymAdmin).mockRejectedValue(new ApiError(Number(status), String(code), String(message)));
    openPage(); const select = await choose(); assign();
    expect((await screen.findByRole("alert")).textContent).toContain(String(message));
    expect(select.value).toBe(jordan.userId);
    expect(admins().getByText("1 assigned")).toBeTruthy();
    expect(admins().queryByText("Jordan Smith")).toBeNull();
    expect(screen.queryByText(/Administrator assigned to Summit/)).toBeNull();
    expect(assignGymAdmin).toHaveBeenCalledTimes(1);
  });
  it("shows a safe failure without exposing an unexpected exception and lets the user retry", async () => {
    vi.mocked(assignGymAdmin).mockRejectedValueOnce(new Error("secret internal details"));
    openPage(); await choose(); assign();
    expect((await screen.findByRole("alert")).textContent).toContain("Could not update this gym's administrators");
    expect(screen.queryByText(/secret internal/)).toBeNull();
    assign(); await screen.findByText("Jordan Smith");
    expect(assignGymAdmin).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not add a user optimistically and locks all writes/refresh until assignment completes", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(assignGymAdmin).mockReturnValueOnce(pending.promise);
    openPage(); await choose(); assign(); assign();
    expect(assignGymAdmin).toHaveBeenCalledTimes(1);
    expect(admins().queryByText("Jordan Smith")).toBeNull();
    for (const name of ["Edit gym", "Deactivate gym", "Refresh details", "Assigning…", "Remove Alex Lee from this gym"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(picker().disabled).toBe(true);
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
  it("removes only the chosen relationship, keeps other administrators and reloads the approved accounts", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, administrators: [alex, jordan] });
    vi.mocked(removeGymAdmin).mockResolvedValue({ ...gym, administrators: [jordan] });
    vi.mocked(listAdminCandidates).mockResolvedValueOnce([]).mockResolvedValue([alex]);
    openPage(); await chooseRemoval(); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("Gym Administrator removed from Summit.");
    expect(removeGymAdmin).toHaveBeenCalledExactlyOnceWith(gymId, alex.userId, expect.any(AbortSignal));
    expect(admins().queryByText("Alex Lee")).toBeNull();
    expect(admins().getByText("Jordan Smith")).toBeTruthy();
    expect(admins().getByText("1 assigned")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Confirm administrator removal" })).toBeNull();
    expect(await screen.findByRole("option", { name: "Alex Lee (alex@example.com)" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(picker()));
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
    openPage(); await choose(); assign(); await screen.findByText("Jordan Smith");
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
    expect(await screen.findByText("Jordan Smith")).toBeTruthy();
    expect(admins().getByText("2 assigned")).toBeTruthy();
    expect(screen.queryByText("Gym Administrator assigned to Summit.")).toBeNull();
  });
  it("disables assignment changes while editing or confirming gym deactivation", async () => {
    openPage(); await screen.findByText("Alex Lee");
    fireEvent.click(screen.getByRole("button", { name: "Edit gym" }));
    expect(picker().disabled).toBe(true);
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
    if (operation === "assign") { await choose(); assign(); }
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
    openPage(); await choose(); assign();
    expect((await screen.findByRole("alert")).textContent).toContain("This gym could not be found");
    expect(screen.queryByRole("form", { name: "Assign Gym Administrator" })).toBeNull();
  });
  it.each(["GYM_ADMIN", "CLIMBER", "VISITOR"])("denies %s before any gym read or write", otherRole => {
    role = otherRole; openPage();
    expect(screen.getByRole("heading", { name: "Administrator access required" })).toBeTruthy();
    expect(getGym).not.toHaveBeenCalled();
    expect(listAdminCandidates).not.toHaveBeenCalled();
    expect(assignGymAdmin).not.toHaveBeenCalled();
    expect(removeGymAdmin).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "Assign Gym Administrator" })).toBeNull();
  });
});

describe("US-006 criterion 6: Gym Administrator details", () => {
  const details: GymAdministratorDetails = {
    ...alex, role: "GYM_ADMIN", isActive: true, createdAt: "2026-10-01T16:00:00.000Z",
    gyms: [
      { gymId, name: "Summit", location: "Toronto", status: "ACTIVE" },
      { gymId: otherGymId, name: "Junction Rock", location: "Toronto West", status: "INACTIVE" },
    ],
  };
  async function openDetails() {
    const button = await screen.findByRole("button", { name: "View details for Alex Lee" });
    button.focus();
    fireEvent.click(button);
    return button;
  }

  it("opens a read-only view of the selected administrator and every gym they administer", async () => {
    vi.mocked(getGymAdmin).mockResolvedValue(details);
    openPage(); await openDetails();
    const dialog = await screen.findByRole("dialog", { name: "Alex Lee" });
    expect(getGymAdmin).toHaveBeenCalledExactlyOnceWith(gymId, alex.userId, expect.any(AbortSignal));
    expect(await within(dialog).findByText("alex@example.com")).toBeTruthy();
    expect(within(dialog).getByText("Gym Administrator", { selector: "dd" })).toBeTruthy();
    expect(within(dialog).getByText("Active", { selector: "dd" })).toBeTruthy();
    expect(within(dialog).getByText("October 1, 2026")).toBeTruthy();
    expect(within(dialog).getByText("Summit").closest("a")).toBeNull();
    expect(within(dialog).getByRole("link", { name: "Junction Rock" }).getAttribute("href")).toBe(`/admin/gyms/${otherGymId}`);
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(within(dialog).getByText("These details are read-only.")).toBeTruthy();
  });
  it("returns focus to the name that opened it when it closes", async () => {
    vi.mocked(getGymAdmin).mockResolvedValue(details);
    openPage(); const opener = await openDetails();
    const dialog = await screen.findByRole("dialog", { name: "Alex Lee" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("shows an inactive account as inactive", async () => {
    vi.mocked(getGymAdmin).mockResolvedValue({ ...details, isActive: false });
    openPage(); await openDetails();
    const dialog = await screen.findByRole("dialog", { name: "Alex Lee" });
    expect(await within(dialog).findByText("Inactive", { selector: "dd" })).toBeTruthy();
  });
  it("explains a failed load without technical details and tries again", async () => {
    vi.mocked(getGymAdmin).mockRejectedValueOnce(new Error("ECONNRESET at db.js:42")).mockResolvedValue(details);
    openPage(); await openDetails();
    const dialog = await screen.findByRole("dialog", { name: "Alex Lee" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Couldn't load these details");
    expect(within(dialog).queryByText(/ECONNRESET/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("alex@example.com")).toBeTruthy();
    expect(getGymAdmin).toHaveBeenCalledTimes(2);
  });
  it("shows the server's message when the account is no longer assigned to this gym", async () => {
    vi.mocked(getGymAdmin).mockRejectedValue(new ApiError(404, "GYM_ADMIN_NOT_FOUND", "This Gym Administrator isn't assigned to this gym."));
    openPage(); await openDetails();
    const dialog = await screen.findByRole("dialog", { name: "Alex Lee" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("isn't assigned to this gym");
  });
});
