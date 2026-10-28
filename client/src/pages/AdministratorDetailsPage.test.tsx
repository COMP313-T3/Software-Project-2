import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdministratorDetailsPage from "./AdministratorDetailsPage.tsx";
import type { AdministratorGateway } from "../lib/administratorDetails.ts";
import type { GymAdministratorDetails } from "../lib/gymsApi.ts";
import { ApiError } from "../lib/apiClient.ts";

let role = "ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({ useSession: () => ({ user: role === "VISITOR" ? null : { userId: "system-admin", role, email: "admin@example.com" } }) }));
const gymId = "507f1f77bcf86cd799439011", otherGymId = "507f1f77bcf86cd799439012", userId = "507f1f77bcf86cd799439013";
const account: GymAdministratorDetails = {
  userId, firstName: "Alex", lastName: "River", email: "alex@example.com", role: "GYM_ADMIN", isActive: true, createdAt: "2026-01-01T12:00:00Z",
  gyms: [{ gymId, name: "Summit", location: "Toronto", status: "ACTIVE" }, { gymId: otherGymId, name: "Riverside", location: "Ottawa", status: "INACTIVE" }],
};
let gateway: AdministratorGateway;
beforeEach(() => {
  role = "ADMIN";
  gateway = {
    get: vi.fn().mockResolvedValue(account), editableFields: ["firstName", "lastName"],
    update: vi.fn().mockImplementation(async (_id, changes) => ({ ...account, ...changes })),
    removeGym: vi.fn().mockImplementation(async (_id, selectedGymId) => ({ ...account, gyms: account.gyms.filter(gym => gym.gymId !== selectedGymId) })),
    deactivate: vi.fn().mockResolvedValue({ ...account, isActive: false }),
  };
});
afterEach(cleanup);
function open(selectedUserId = userId) {
  return render(<MemoryRouter initialEntries={[`/admin/gyms/${gymId}/admins/${selectedUserId}`]}>
    <Link to={`/admin/gyms/${gymId}/admins/${otherGymId}`}>Open another administrator</Link>
    <Routes><Route path="/admin/gyms/:gymId/admins/:userId" element={<AdministratorDetailsPage gateway={gateway} />} /></Routes>
  </MemoryRouter>);
}
async function loaded() { return screen.findByRole("heading", { name: "Alex River" }); }
async function edit() { await loaded(); fireEvent.click(screen.getByRole("button", { name: "Edit account information" })); }
function changeFirstName(value: string) { fireEvent.change(screen.getByLabelText("First name"), { target: { value } }); }

describe("US007 administrator details and access controls (injected contract)", () => {
  it("allows correction of a duplicate email without discarding the draft or locking the form", async () => {
    gateway.editableFields = ["email", "phone"];
    vi.mocked(gateway.update!).mockRejectedValueOnce(new ApiError(409, "EMAIL_TAKEN", "Taken", { email: "This email already belongs to another TopSend account." }));
    open(); await edit();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taken@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findAllByText("This email already belongs to another TopSend account.");
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Account information updated.");
    expect(gateway.update).toHaveBeenCalledTimes(2);
  });
  it("explains a refused last-administrator removal without announcing success", async () => {
    vi.mocked(gateway.removeGym!).mockRejectedValue(new ApiError(409, "LAST_GYM_ADMIN", "Blocked"));
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Remove access to Summit" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText(/only active administrator and it has upcoming competitions/);
    expect(screen.queryByText("Access to Summit removed.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("link", { name: "Summit" })).toBeTruthy();
  });
  it.each(["VISITOR", "CLIMBER", "GYM_ADMIN"])("does not load private data or render controls for %s", async rejectedRole => {
    role = rejectedRole; open(); expect(screen.getByRole("heading", { name: "System Administrator access required" })).toBeTruthy();
    expect(gateway.get).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Deactivate account" })).toBeNull();
  });
  it("shows account information and all gym assignments, with separate account and gym states", async () => {
    open(); await loaded(); expect(screen.getByText("alex@example.com")).toBeTruthy(); expect(screen.getByText("Active account")).toBeTruthy();
    const gyms = screen.getByRole("region", { name: "Current gym access" }); expect(within(gyms).getByText("Riverside")).toBeTruthy();
    expect(within(gyms).getByText("Gym inactive")).toBeTruthy(); expect(gateway.get).toHaveBeenCalledWith(gymId, userId, expect.any(AbortSignal));
  });
  it("shows loading without pretending there are no assignments", async () => {
    let finish!: (record: GymAdministratorDetails) => void;
    vi.mocked(gateway.get).mockReturnValue(new Promise(resolve => { finish = resolve; })); open();
    expect(screen.getByText("Loading administrator details…")).toBeTruthy(); expect(screen.queryByText("No gyms are assigned to this account.")).toBeNull();
    await act(async () => finish(account)); await loaded();
  });
  it("allows read-only display when write endpoints are not connected", async () => {
    gateway = { get: gateway.get }; open(); await loaded();
    expect((screen.getByRole("button", { name: "Edit account information" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Remove access to Summit" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Deactivate account" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("edits only enabled fields and saves only actual changes", async () => {
    open(); await edit(); expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull(); changeFirstName(" Jordan ");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" })); await screen.findByText("Account information updated.");
    expect(gateway.update).toHaveBeenCalledExactlyOnceWith(userId, { firstName: "Jordan" }, expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "Jordan River" })).toBeTruthy();
  });
  it("validates fields without moving focus away on the next keystroke", async () => {
    open(); await edit(); changeFirstName(" "); fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Enter the first name."); expect(gateway.update).not.toHaveBeenCalled();
    const input = screen.getByLabelText("First name"); input.focus(); changeFirstName("J"); expect(document.activeElement).toBe(input);
  });
  it("does not send an unchanged form and cancellation restores the original account", async () => {
    open(); await edit(); fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Change at least one account detail before saving."); expect(gateway.update).not.toHaveBeenCalled();
    changeFirstName("Changed"); fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
    expect(screen.getByRole("heading", { name: "Alex River" })).toBeTruthy(); expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit account information" }));
  });
  it("does not remove gym access before confirmation, and Cancel sends no request", async () => {
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Remove access to Summit" }));
    expect(screen.getByRole("dialog", { name: "Remove access to Summit?" })).toBeTruthy(); expect(gateway.removeGym).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(gateway.removeGym).not.toHaveBeenCalled();
  });
  it("removes only the confirmed gym using the returned account state", async () => {
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Remove access to Summit" })); fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("Access to Summit removed."); expect(gateway.removeGym).toHaveBeenCalledExactlyOnceWith(userId, gymId, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Remove access to Summit" })).toBeNull(); expect(screen.getByText("Riverside")).toBeTruthy(); expect(screen.getByText("Active account")).toBeTruthy();
  });
  it("asks for account-wide deactivation confirmation and displays the resulting inactive state", async () => {
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
    expect(screen.getByText(/at any gym. This does not delete/)).toBeTruthy(); expect(gateway.deactivate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" })); await screen.findByText("Account deactivated.");
    expect(screen.getByText("Inactive account")).toBeTruthy(); expect(screen.getByText("Summit")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Deactivate account" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("locks repeated confirms and cancellation while a mutation is pending", async () => {
    let finish!: (record: GymAdministratorDetails) => void;
    vi.mocked(gateway.deactivate!).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Deactivate account" })); fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    const pending = screen.getByRole("button", { name: "Applying change…" }); fireEvent.click(pending); expect(gateway.deactivate).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ...account, isActive: false })); await screen.findByText("Account deactivated.");
  });
  it("preserves edits and field errors after a validation refusal", async () => {
    vi.mocked(gateway.update!).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "invalid", { firstName: "Choose another first name." }));
    open(); await edit(); changeFirstName("Jordan"); fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Choose another first name."); expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jordan"); expect(screen.getByRole("heading", { name: "Alex River" })).toBeTruthy();
  });
  it("does not announce success or allow repeated writes after an uncertain failure", async () => {
    vi.mocked(gateway.deactivate!).mockRejectedValue(new ApiError(500, "INTERNAL", "private database details"));
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Deactivate account" })); fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    await screen.findByRole("alert"); expect(screen.queryByText("Account deactivated.")).toBeNull(); expect(screen.queryByText(/private database/)).toBeNull();
    expect((screen.getByRole("button", { name: "Confirm deactivation" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
    await loaded(); expect((screen.getByRole("button", { name: "Deactivate account" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([401, 403, 404])("removes private account data after a write loses access (%s)", async status => {
    vi.mocked(gateway.deactivate!).mockRejectedValue(new ApiError(status, "DENIED", "private internal message"));
    open(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Deactivate account" })); fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    await screen.findByRole("heading", { name: "Administrator unavailable" }); expect(screen.queryByText("alex@example.com")).toBeNull(); expect(screen.queryByRole("button", { name: "Deactivate account" })).toBeNull();
  });
  it("handles no assigned gyms and inactive accounts without offering reactivation", async () => {
    vi.mocked(gateway.get).mockResolvedValue({ ...account, gyms: [], isActive: false }); open();
    await screen.findByText("No gyms are assigned to this account."); expect(screen.queryByRole("button", { name: /Remove access/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reactivate/ })).toBeNull(); expect((screen.getByRole("button", { name: "Deactivate account" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("validates an ID before reading and allows recovery from a non-sensitive loading error", async () => {
    const mounted = open("bad"); expect(screen.getByText("Invalid administrator link")).toBeTruthy(); expect(gateway.get).not.toHaveBeenCalled(); mounted.unmount();
    vi.mocked(gateway.get).mockRejectedValueOnce(new Error("private stack trace")); open(); await screen.findByRole("alert"); expect(screen.queryByText(/private stack/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await loaded();
  });
  it("ignores an obsolete read after navigating to a different administrator", async () => {
    let finish!: (record: GymAdministratorDetails) => void;
    vi.mocked(gateway.get).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ...account, userId: otherGymId, firstName: "Jordan" });
    open(); const signal = vi.mocked(gateway.get).mock.calls[0][2]; fireEvent.click(screen.getByRole("link", { name: "Open another administrator" }));
    await screen.findByRole("heading", { name: "Jordan River" }); expect(signal.aborted).toBe(true);
    await act(async () => finish(account)); expect(screen.queryByRole("heading", { name: "Alex River" })).toBeNull();
  });
});
