import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import {
  fetchAdminDashboard,
  fetchSystemSettings,
  saveSystemSettings,
  type SystemSettings,
} from "../lib/adminApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";
import { ApiError } from "../lib/apiClient.ts";
import { liveUpdates } from "../test/liveUpdates.ts";

vi.mock("../lib/adminApi.ts", () => ({
  fetchAdminDashboard: vi.fn(),
  fetchSystemSettings: vi.fn(),
  saveSystemSettings: vi.fn(),
}));

const initialSettings: SystemSettings = {
  platformName: "TopSend",
  climberRegistrationEnabled: true,
};
const updatedSettings: SystemSettings = {
  platformName: "Boulder Hub",
  climberRegistrationEnabled: false,
};

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/admin/settings"]}>
      <App />
    </MemoryRouter>,
  );
}

let live: ReturnType<typeof liveUpdates>;

beforeEach(() => {
  live = liveUpdates();
  vi.mocked(fetchAdminDashboard).mockReset();
  vi.mocked(fetchSystemSettings).mockReset().mockResolvedValue(initialSettings);
  vi.mocked(saveSystemSettings).mockReset().mockResolvedValue(updatedSettings);
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
    csrfToken: "csrf-for-tests",
    sessionCookie: true,
  });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({
    userId: "admin-id",
    role: "ADMIN",
    token: "admin-token",
    expiresAt: "2026-10-06T05:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "admin-id",
    email: "admin@example.com",
    role: "ADMIN",
    session: { expiresIn: 3600, limitReached: false },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-010 system settings", () => {
  it("rejects whitespace-only names without sending a request", async () => {
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Enter a platform name.")).toBeTruthy();
    expect(saveSystemSettings).not.toHaveBeenCalled();
  });
  it("discards edits and disables saving when no settings changed", async () => {
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: "Other" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((name as HTMLInputElement).value).toBe("TopSend"); expect(saveSystemSettings).not.toHaveBeenCalled();
  });
  it("trims the name and sends only the changed setting", async () => {
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    fireEvent.change(name, { target: { value: "  Boulder Hub  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByText("System settings saved.");
    expect(saveSystemSettings).toHaveBeenCalledWith({ platformName: "Boulder Hub" }, expect.any(AbortSignal));
  });
  it("does not expose internal server errors", async () => {
    vi.mocked(saveSystemSettings).mockRejectedValueOnce(new ApiError(500, "INTERNAL", "private database detail"));
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    fireEvent.change(name, { target: { value: "Other" } }); fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect((await screen.findByRole("alert")).textContent).not.toContain("private");
  });
  it.each([401, 403])("removes the editable form when save loses authorization (%s)", async status => {
    vi.mocked(saveSystemSettings).mockRejectedValueOnce(new ApiError(status, "DENIED", "hidden"));
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    fireEvent.change(name, { target: { value: "Other" } }); fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByRole("alert"); expect(screen.queryByLabelText("Platform display name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
  it("follows the settings another System Administrator saves", async () => {
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    vi.mocked(fetchSystemSettings).mockResolvedValue(updatedSettings); await live.announce([{ topic: "settings" }]);
    await waitFor(() => expect((name as HTMLInputElement).value).toBe("Boulder Hub"));
    expect((screen.getByRole("checkbox", { name: /allow new public climber sign-ups/i }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("doesn't reload over changes that aren't saved, and reloads once they're discarded", async () => {
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    fireEvent.change(name, { target: { value: "Other" } }); vi.mocked(fetchSystemSettings).mockResolvedValue(updatedSettings);
    await live.announce([{ topic: "settings" }]); expect(fetchSystemSettings).toHaveBeenCalledOnce(); expect((name as HTMLInputElement).value).toBe("Other");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect((name as HTMLInputElement).value).toBe("Boulder Hub"));
  });
  it("keeps the settings when a reload fails, and doesn't reload for other changes", async () => {
    renderSettings(); const name = await screen.findByLabelText("Platform display name");
    await live.announce([{ topic: "users" }, { topic: "gyms" }]); expect(fetchSystemSettings).toHaveBeenCalledOnce();
    vi.mocked(fetchSystemSettings).mockRejectedValueOnce(new ApiError(503, "INTERNAL", "private database detail"));
    await live.announce(null); await waitFor(() => expect(fetchSystemSettings).toHaveBeenCalledTimes(2));
    expect((name as HTMLInputElement).value).toBe("TopSend"); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("recovers from a loading failure", async () => {
    vi.mocked(fetchSystemSettings).mockRejectedValueOnce(new Error("offline")); renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Platform display name")).toBeTruthy();
  });
  it("loads saved settings, saves changed values, and reloads them after a page refresh", async () => {
    renderSettings();

    const name = await screen.findByLabelText("Platform display name");
    const registration = screen.getByRole("checkbox", {
      name: /allow new public climber sign-ups/i,
    });
    expect((name as HTMLInputElement).value).toBe("TopSend");
    expect((registration as HTMLInputElement).checked).toBe(true);

    fireEvent.change(name, { target: { value: "Boulder Hub" } });
    fireEvent.click(registration);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "System settings saved.",
    );
    expect(saveSystemSettings).toHaveBeenCalledWith(
      {
        platformName: "Boulder Hub",
        climberRegistrationEnabled: false,
      },
      expect.any(AbortSignal),
    );
    expect((screen.getByLabelText("Platform display name") as HTMLInputElement).value).toBe(
      "Boulder Hub",
    );
    expect(
      (screen.getByRole("checkbox", { name: /allow new public climber sign-ups/i }) as HTMLInputElement).checked,
    ).toBe(false);

    cleanup();
    vi.mocked(fetchSystemSettings).mockResolvedValueOnce(updatedSettings);
    renderSettings();

    expect(
      (await screen.findByLabelText("Platform display name") as HTMLInputElement)
        .value,
    ).toBe("Boulder Hub");
    expect(
      (screen.getByRole("checkbox", { name: /allow new public climber sign-ups/i }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(fetchSystemSettings).toHaveBeenCalledTimes(2);
  });

  it("shows a readable save error and keeps the unsaved draft", async () => {
    vi.mocked(saveSystemSettings).mockRejectedValueOnce(
      new Error("offline"),
    );
    renderSettings();

    const name = await screen.findByLabelText("Platform display name");
    fireEvent.change(name, { target: { value: "Boulder Hub" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't save system settings. Please try again.",
    );
    expect((screen.getByLabelText("Platform display name") as HTMLInputElement).value).toBe(
      "Boulder Hub",
    );
  });
});
