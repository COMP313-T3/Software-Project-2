import {
  cleanup,
  fireEvent,
  render,
  screen,
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

beforeEach(() => {
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
