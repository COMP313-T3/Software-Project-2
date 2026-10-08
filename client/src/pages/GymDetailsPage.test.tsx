import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GymDetailsPage from "./GymDetailsPage.tsx";
import { deactivateGym, getGym, updateGym, type GymDetails } from "../lib/gymsApi.ts";
import { ApiError } from "../lib/apiClient.ts";

let role: "ADMIN" | "GYM_ADMIN" | "CLIMBER" | "VISITOR" = "ADMIN";
vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ user: role === "VISITOR" ? null : { userId: "admin-account", role, email: "admin@example.com" } }),
}));
vi.mock("../lib/gymsApi.ts", () => ({ getGym: vi.fn(), updateGym: vi.fn(), deactivateGym: vi.fn() }));
const gymId = "507f1f77bcf86cd799439011";
const secondId = "507f1f77bcf86cd799439012";
const gym: GymDetails = {
  gymId, name: "Summit", location: "Toronto", status: "ACTIVE",
  administrators: [
    { userId: "staff-a", firstName: "Alex", lastName: "Lee", email: "alex@example.com" },
    { userId: "staff-b", firstName: "Jordan", lastName: "Smith", email: "jordan@example.com" },
  ],
};
function openPage() {
  return render(<MemoryRouter initialEntries={[`/admin/gyms/${gymId}`]}>
    <Link to={`/admin/gyms/${secondId}`}>Open second gym</Link>
    <Routes><Route path="/admin/gyms/:gymId" element={<GymDetailsPage />} /></Routes>
  </MemoryRouter>);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function edit() { fireEvent.click(await screen.findByRole("button", { name: "Edit gym" })); }
function changeName(value: string) { fireEvent.change(screen.getByLabelText("Gym name"), { target: { value } }); }
function changeLocation(value: string) { fireEvent.change(screen.getByLabelText("Location"), { target: { value } }); }
beforeEach(() => {
  role = "ADMIN";
  vi.mocked(getGym).mockReset().mockResolvedValue(gym);
  vi.mocked(updateGym).mockReset().mockResolvedValue({ ...gym, name: "New Summit" });
  vi.mocked(deactivateGym).mockReset().mockResolvedValue({ ...gym, status: "INACTIVE" });
});
afterEach(cleanup);

describe("US-005 #30/#31 Gym Details", () => {
  it("loads the selected gym and all assigned administrators from a direct link", async () => {
    openPage();
    expect(await screen.findByText("Toronto")).toBeTruthy();
    const admins = screen.getByRole("region", { name: "Gym administrators" });
    expect(within(admins).getByText("Alex Lee")).toBeTruthy();
    expect(within(admins).getByText("jordan@example.com")).toBeTruthy();
    expect(within(admins).getByText("2 assigned")).toBeTruthy();
    expect(getGym).toHaveBeenCalledExactlyOnceWith(gymId, expect.any(AbortSignal));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(updateGym).not.toHaveBeenCalled();
  });
  it("shows loading without an invented empty administrator list", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(getGym).mockReturnValue(pending.promise);
    openPage();
    expect(screen.getByRole("status").textContent).toContain("Loading gym details");
    expect(screen.queryByText("No gym administrators assigned")).toBeNull();
    await act(async () => pending.resolve(gym));
    expect(screen.queryByText(/Loading gym details/)).toBeNull();
  });
  it("shows the empty state only for a loaded gym with no assignments", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, administrators: [] });
    openPage();
    expect(await screen.findByText("No gym administrators assigned")).toBeTruthy();
    expect(screen.getByText("0 assigned")).toBeTruthy();
  });
  it("trims and saves only changed fields for the selected gym", async () => {
    openPage(); await edit(); changeName(" New Summit ");
    expect((screen.getByRole("button", { name: "Refresh details" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Gym details saved successfully.")).toBeTruthy();
    expect(updateGym).toHaveBeenCalledExactlyOnceWith(gymId, { name: "New Summit" }, expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "New Summit" })).toBeTruthy();
    expect(screen.getByText("Alex Lee")).toBeTruthy();
    expect(screen.queryByLabelText("Gym name")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit gym" })).toBe(document.activeElement);
  });
  it("keeps unchanged input from sending an empty PATCH", async () => {
    openPage(); await edit(); changeName(" Summit ");
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("form", { name: "Edit gym information" }));
    expect(updateGym).not.toHaveBeenCalled();
  });
  it("cancels edits and restores saved fields when editing again", async () => {
    openPage(); await edit(); changeName("Unsaved");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await edit();
    expect((screen.getByLabelText("Gym name") as HTMLInputElement).value).toBe("Summit");
    expect(updateGym).not.toHaveBeenCalled();
  });
  it("blocks blank fields with accessible feedback and focuses the first error", async () => {
    openPage(); await edit(); changeName("  "); changeLocation("  ");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Enter a gym name.").id).toBe("detail-name-error");
    expect(screen.getByLabelText("Location").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Gym name")).toBe(document.activeElement);
    expect(updateGym).not.toHaveBeenCalled();
  });
  it("checks the same name/location length limits as the API", async () => {
    openPage(); await edit(); changeName("x".repeat(101)); changeLocation("y".repeat(201));
    fireEvent.submit(screen.getByRole("form", { name: "Edit gym information" }));
    expect(screen.getByText("Use 100 characters or fewer.")).toBeTruthy();
    expect(screen.getByText("Use 200 characters or fewer.")).toBeTruthy();
    expect(updateGym).not.toHaveBeenCalled();
  });
  it("preserves edits and saved information after a duplicate rejection", async () => {
    vi.mocked(updateGym).mockRejectedValueOnce(new ApiError(409, "GYM_EXISTS", "Duplicate"));
    openPage(); await edit(); changeName("Existing Gym");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already exists");
    expect((screen.getByLabelText("Gym name") as HTMLInputElement).value).toBe("Existing Gym");
    expect(screen.getByRole("heading", { name: "Summit" })).toBeTruthy();
    expect(screen.queryByText("Gym details saved successfully.")).toBeNull();
    changeName("New Summit");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Gym details saved successfully.");
    expect(updateGym).toHaveBeenCalledTimes(2);
  });
  it("displays backend field errors and focuses them after the form unlocks", async () => {
    vi.mocked(updateGym).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check your input.", { location: "Use a valid gym location." }));
    openPage(); await edit(); changeLocation("New address");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Use a valid gym location.")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Location")).toBe(document.activeElement));
    expect(screen.getByLabelText("Location").getAttribute("aria-describedby")).toBe("detail-location-error");
  });
  it("prevents a second write while a save is in flight", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(updateGym).mockReturnValueOnce(pending.promise);
    openPage(); await edit(); changeName("New Summit");
    const form = screen.getByRole("form", { name: "Edit gym information" });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(updateGym).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Gym name").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ...gym, name: "New Summit" }));
  });
  it("uses a safe generic message for unexpected write failures without retrying", async () => {
    vi.mocked(updateGym).mockRejectedValue(new Error("Internal secret/debug information"));
    openPage(); await edit(); changeName("New Summit");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not save this change");
    expect(screen.queryByText(/Internal secret/)).toBeNull();
    expect(updateGym).toHaveBeenCalledTimes(1);
  });
  it("refreshes both gym information and administrator assignments", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(getGym).mockResolvedValueOnce(gym).mockReturnValueOnce(pending.promise);
    openPage(); await screen.findByText("Alex Lee");
    fireEvent.click(screen.getByRole("button", { name: "Refresh details" }));
    expect(screen.queryByText("Alex Lee")).toBeNull();
    await act(async () => pending.resolve({ ...gym, location: "Ottawa", administrators: [] }));
    expect(screen.getByText("Ottawa")).toBeTruthy();
    expect(screen.getByText("No gym administrators assigned")).toBeTruthy();
  });
  it.each([
    [400, "This gym link is invalid"], [404, "This gym could not be found"], [403, "Administrator access required."],
  ])("handles detail HTTP %s without displaying a fake gym", async (status, message) => {
    vi.mocked(getGym).mockRejectedValue(new ApiError(status, "FAILED", message));
    openPage();
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(screen.queryByRole("button", { name: "Edit gym" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Gym administrators" })).toBeNull();
  });
  it("recovers a failed details read when the user retries", async () => {
    vi.mocked(getGym).mockRejectedValueOnce(new ApiError(500, "UNAVAILABLE", "Please try again."));
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alex Lee")).toBeTruthy();
    expect(getGym).toHaveBeenCalledTimes(2);
  });
  it("deactivates the selected gym only after confirmation and keeps its administrators", async () => {
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "Deactivate gym" }));
    expect(deactivateGym).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel deactivation" }));
    expect(deactivateGym).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate gym" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    expect(await screen.findByText("Summit was deactivated.")).toBeTruthy();
    expect(deactivateGym).toHaveBeenCalledExactlyOnceWith(gymId, expect.any(AbortSignal));
    expect(screen.getByText("INACTIVE")).toBeTruthy();
    expect(screen.getByText("Alex Lee")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deactivate gym" })).toBeNull();
  });
  it("preserves active status after a failed deactivation", async () => {
    vi.mocked(deactivateGym).mockRejectedValue(new ApiError(403, "ROLE_FORBIDDEN", "Administrator access required."));
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "Deactivate gym" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Administrator access required");
    expect(screen.getByText("ACTIVE")).toBeTruthy();
    expect(screen.getByText("Alex Lee")).toBeTruthy();
    expect(deactivateGym).toHaveBeenCalledTimes(1);
  });
  it("has no deactivation action for an already inactive gym", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, status: "INACTIVE" });
    openPage(); await screen.findByText("INACTIVE");
    expect(screen.queryByRole("button", { name: "Deactivate gym" })).toBeNull();
  });
  it("cancels stale reads and shows only the newly selected gym's administrators", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(getGym).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...gym, gymId: secondId, name: "Other Gym", location: "Ottawa", administrators: [] });
    openPage();
    await waitFor(() => expect(getGym).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(getGym).mock.calls[0][1]!;
    fireEvent.click(screen.getByRole("link", { name: "Open second gym" }));
    await screen.findByRole("heading", { name: "Other Gym" });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(gym));
    expect(screen.queryByText("Alex Lee")).toBeNull();
    expect(screen.getByText("No gym administrators assigned")).toBeTruthy();
  });
  it("ignores a save response after navigation to a different gym", async () => {
    const pending = deferred<GymDetails>();
    vi.mocked(updateGym).mockReturnValueOnce(pending.promise);
    vi.mocked(getGym).mockResolvedValueOnce(gym).mockResolvedValueOnce({ ...gym, gymId: secondId, name: "Other Gym", administrators: [] });
    openPage(); await edit(); changeName("New Summit");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const signal = vi.mocked(updateGym).mock.calls[0][2]!;
    fireEvent.click(screen.getByRole("link", { name: "Open second gym" }));
    await screen.findByRole("heading", { name: "Other Gym" });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ...gym, name: "New Summit" }));
    expect(screen.queryByRole("heading", { name: "New Summit" })).toBeNull();
    expect(screen.queryByText("Gym details saved successfully.")).toBeNull();
  });
  it.each(["GYM_ADMIN", "CLIMBER", "VISITOR"] as const)("blocks %s before calling a gym API", async otherRole => {
    role = otherRole;
    openPage();
    expect(screen.getByRole("heading", { name: "Administrator access required" })).toBeTruthy();
    expect(getGym).not.toHaveBeenCalled();
    expect(updateGym).not.toHaveBeenCalled();
    expect(deactivateGym).not.toHaveBeenCalled();
  });
});
