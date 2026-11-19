import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceNotice } from "../../lib/maintenanceNoticeApi.ts";
import { liveUpdates } from "../../test/liveUpdates.ts";
import MaintenanceNotice from "./MaintenanceNotice.tsx";

let role = "CLIMBER";
vi.mock("../session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "user-id", role, email: "person@example.com" } }),
}));

let live: ReturnType<typeof liveUpdates>;
beforeEach(() => {
  role = "CLIMBER";
  live = liveUpdates();
});
afterEach(cleanup);

describe("US-010 the maintenance notice on every logged-in page", () => {
  it("shows nothing while no message is set and maintenance mode is off", async () => {
    render(<MaintenanceNotice />);
    await waitFor(() => expect(getMaintenanceNotice).toHaveBeenCalledOnce());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the System Administrators' message to everyone logged in", async () => {
    vi.mocked(getMaintenanceNotice).mockResolvedValueOnce({ maintenanceMode: false, maintenanceMessage: "Maintenance tonight at 11:00 p.m." });
    render(<MaintenanceNotice />);
    expect((await screen.findByRole("status")).textContent).toBe("Maintenance tonight at 11:00 p.m.");
  });

  it("reminds only a System Administrator that maintenance mode is on", async () => {
    const on = { maintenanceMode: true, maintenanceMessage: "" };
    vi.mocked(getMaintenanceNotice).mockResolvedValueOnce(on).mockResolvedValueOnce(on);
    role = "ADMIN";
    const admin = render(<MaintenanceNotice />);
    expect((await screen.findByRole("status")).textContent).toBe("Maintenance mode is on, so only System Administrators can log in.");
    admin.unmount();

    role = "GYM_ADMIN";
    render(<MaintenanceNotice />);
    await waitFor(() => expect(getMaintenanceNotice).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("follows a saved change by itself", async () => {
    render(<MaintenanceNotice />);
    await waitFor(() => expect(getMaintenanceNotice).toHaveBeenCalledOnce());
    vi.mocked(getMaintenanceNotice).mockResolvedValueOnce({ maintenanceMode: false, maintenanceMessage: "Back at 1:00 a.m." });

    await live.announce([{ topic: "settings" }]);

    expect((await screen.findByRole("status")).textContent).toBe("Back at 1:00 a.m.");
  });
});
