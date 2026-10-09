import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { createGym, listGyms, getGym } from "../lib/gymsApi.ts";
import { ApiError } from "../lib/apiClient.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/gymsApi.ts", () => ({ createGym: vi.fn(), listGyms: vi.fn(), getGym: vi.fn(), updateGym: vi.fn(), deactivateGym: vi.fn(), assignGymAdmin: vi.fn(), removeGymAdmin: vi.fn() }));
const gym = { gymId: "gym-1", name: "Summit", location: "Auckland", status: "ACTIVE" as const, administrators: [] };
function openPage(path = "/admin/gyms") { render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
beforeEach(() => {
  vi.mocked(getGym).mockReset(); vi.mocked(getGym).mockResolvedValue(gym);
  vi.mocked(listGyms).mockReset(); vi.mocked(createGym).mockReset();
  vi.mocked(listGyms).mockResolvedValue({ gyms: [gym], total: 1, page: 1, limit: 20 });
  vi.mocked(createGym).mockResolvedValue(gym);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({ csrfToken: "test", sessionCookie: true });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "admin-id", role: "ADMIN", token: "test-token", expiresAt: "2099-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "admin-id", email: "admin@example.com", role: "ADMIN", session: { expiresIn: 3600, limitReached: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("US-004 gym management", () => {
  it("opens actual details for the gym selected from the list", async () => {
    openPage(); await screen.findByText("Summit");
    const detailsLink = screen.getByRole("link", { name: "View details for Summit" });
    expect(detailsLink.getAttribute("href")).toBe("/admin/gyms/gym-1");
    fireEvent.click(detailsLink);
    expect(await screen.findByRole("heading", { name: "Gym details" })).toBeTruthy();
    expect(await screen.findByText("Auckland")).toBeTruthy();
    expect(getGym).toHaveBeenCalledWith("gym-1", expect.any(AbortSignal));
  });
  it("rejects blank input without sending a write", async () => {
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "+ Add gym" }));
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    expect(screen.getByText("Enter a gym name.").id).toBe("gym-name-error");
    expect(screen.getByText("Enter a location.").id).toBe("gym-location-error");
    expect(screen.getByLabelText("Gym name").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Location").getAttribute("aria-invalid")).toBe("true");
    expect(createGym).not.toHaveBeenCalled();
  });
  it.each(["12345", "!?--"])("rejects numeric or symbolic fields (%s) with corresponding feedback", async value => {
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "+ Add gym" }));
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    expect(screen.getByText("Gym name must include letters, not only numbers or symbols.").id).toBe("gym-name-error");
    expect(screen.getByText("Location must include letters, not only numbers or symbols.").id).toBe("gym-location-error");
    expect(createGym).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: "Gym 9" } });
    expect(screen.queryByText("Gym name must include letters, not only numbers or symbols.")).toBeNull();
    expect(screen.getByLabelText("Location").getAttribute("aria-invalid")).toBe("true");
  });
  it.each([
    ["Gym 9", "123 Main Street"],
    ["攀岩馆", "北京市朝阳路123号"],
  ])("accepts letters with numbers and international text (%s)", async (name, location) => {
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "+ Add gym" }));
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: location } });
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    await screen.findByText("Summit was added successfully.");
    expect(createGym).toHaveBeenCalledExactlyOnceWith({ name, location, status: "ACTIVE" });
  });
  it("trims values, saves once, closes the form and refreshes the directory", async () => {
    openPage(); await screen.findByText("Summit");
    fireEvent.click(screen.getByRole("button", { name: "+ Add gym" }));
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: " Summit " } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: " Auckland " } });
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    await screen.findByText("Summit was added successfully.");
    expect(createGym).toHaveBeenCalledExactlyOnceWith({ name: "Summit", location: "Auckland", status: "ACTIVE" });
    expect(screen.queryByLabelText("Gym name")).toBeNull();
    await waitFor(() => expect(listGyms).toHaveBeenCalledTimes(2));
  });
  it("preserves input when the backend rejects a duplicate", async () => {
    vi.mocked(createGym).mockRejectedValue(new ApiError(409, "GYM_EXISTS", "Duplicate"));
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "+ Add gym" }));
    fireEvent.change(screen.getByLabelText("Gym name"), { target: { value: "Summit" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Auckland" } });
    fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
    expect((await screen.findByRole("alert")).textContent).toContain("already exists");
    expect((screen.getByLabelText("Gym name") as HTMLInputElement).value).toBe("Summit");
  });
  it("changes pages then resets to page one when filtering", async () => {
    vi.mocked(listGyms).mockResolvedValue({ gyms: [gym], total: 21, page: 1, limit: 20 });
    openPage(); await screen.findByText("Summit");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(listGyms).toHaveBeenLastCalledWith(2, "", expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "PENDING" } });
    await waitFor(() => expect(listGyms).toHaveBeenLastCalledWith(1, "PENDING", expect.any(AbortSignal)));
  });
  it("recovers from a list failure and shows an empty directory", async () => {
    vi.mocked(listGyms).mockRejectedValueOnce(new Error("Server unavailable"));
    vi.mocked(listGyms).mockResolvedValue({ gyms: [], total: 0, page: 1, limit: 20 });
    openPage(); fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No gyms registered yet")).toBeTruthy();
  });
  it("prevents non-admin users from loading the gym API", async () => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
    openPage(); expect(await screen.findByText("Administrator access required")).toBeTruthy();
    expect(listGyms).not.toHaveBeenCalled();
  });
});


describe("US-004 read-only gym details", () => {
  it("loads the selected record when opening a detail URL directly", async () => {
    vi.mocked(getGym).mockResolvedValue({ ...gym, gymId: "gym-2", name: "Other gym", location: "Wellington", status: "PENDING" });
    openPage("/admin/gyms/gym-2");
    expect(await screen.findByText("Wellington")).toBeTruthy();
    expect(screen.getByText("PENDING")).toBeTruthy();
    expect(getGym).toHaveBeenCalledWith("gym-2", expect.any(AbortSignal));
    expect(listGyms).not.toHaveBeenCalled();
    expect(createGym).not.toHaveBeenCalled();
  });
  it("shows a missing-record message instead of fake details", async () => {
    vi.mocked(getGym).mockRejectedValue(new ApiError(404, "GYM_NOT_FOUND", "Gym not found"));
    openPage("/admin/gyms/missing");
    expect((await screen.findByRole("alert")).textContent).toContain("could not be found");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to gym directory/ }).getAttribute("href")).toBe("/admin/gyms");
  });
  it("recovers from a failed detail request", async () => {
    vi.mocked(getGym).mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Server unavailable"));
    openPage("/admin/gyms/gym-1");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Auckland")).toBeTruthy();
    expect(getGym).toHaveBeenCalledTimes(2);
  });
  it("blocks non-admin detail reads", async () => {
    vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "climber", email: "climber@example.com", role: "CLIMBER", session: { expiresIn: 3600, limitReached: false } });
    openPage("/admin/gyms/gym-1");
    expect(await screen.findByText("Administrator access required")).toBeTruthy();
    expect(getGym).not.toHaveBeenCalled();
  });
});
