import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import {
  fetchAdminDashboard,
  type AdminDashboardSummary,
} from "../lib/adminApi.ts";
import { ApiError } from "../lib/apiClient.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/adminApi.ts", () => ({ fetchAdminDashboard: vi.fn() }));
vi.mock("../lib/gymAdminApi.ts", () => ({
  fetchGymAdminDashboard: vi.fn(async () => ({ gyms: [], counts: { upcoming: 0, past: 0, drafts: 0 }, upcoming: [] })),
  listManagedCompetitions: vi.fn(async () => ({ competitions: [], total: 0, page: 1, limit: 20 })),
  getManagedCompetition: vi.fn(),
}));

const summary: AdminDashboardSummary = {
  gyms: { total: 12, active: 9, pending: 2, inactive: 1 },
  users: { total: 250, admins: 2, gymAdmins: 18, climbers: 230 },
  pendingRequests: { total: 3, newGyms: 1, existingGyms: 2 },
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <App />
    </MemoryRouter>,
  );
}

function currentUser(role: sessionApi.CurrentUser["role"] = "ADMIN") {
  return {
    userId: "admin-id",
    email: "admin@example.com",
    role,
    session: { expiresIn: 3600, limitReached: false },
  };
}

beforeEach(() => {
  vi.mocked(fetchAdminDashboard).mockReset();
  vi.mocked(fetchAdminDashboard).mockResolvedValue(summary);
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
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue(currentUser());
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-003: the admin dashboard", () => {
  it("loads gym, user, and request totals with their documented breakdowns", async () => {
    renderDashboard();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Admin dashboard" }),
    ).toBeTruthy();
    expect(
      await within(screen.getByRole("link", { name: /Total gyms/ })).findByText(
        "12",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("link", { name: /Total users/ })).getByText(
        "250",
      ),
    ).toBeTruthy();
    const totals = screen.getByRole("region", { name: "Platform totals" });
    expect(
      within(
        within(totals).getByRole("link", { name: /^Pending requests/ }),
      ).getByText("3"),
    ).toBeTruthy();
    const gyms = screen.getByRole("region", { name: "Gym overview" });
    expect(within(gyms).getByText("9")).toBeTruthy();
    expect(within(gyms).getByText("Inactive gyms")).toBeTruthy();
    const users = screen.getByRole("region", { name: "User totals" });
    expect(within(users).getByText("230")).toBeTruthy();
    const requests = screen.getByRole("region", { name: "Pending requests" });
    expect(within(requests).getByText("New gyms")).toBeTruthy();
    expect(within(requests).getByText("Existing gyms")).toBeTruthy();
    expect(document.title).toBe("Admin Dashboard | TopSend");
  });

  it("provides navigation to the available overview sections without linking to missing pages", async () => {
    renderDashboard();
    await screen.findByRole("heading", { level: 1, name: "Admin dashboard" });

    const nav = screen.getByRole("navigation", { name: "Admin dashboard" });
    for (const [label, target] of [
      ["Overview", "overview"],
      ["Gym overview", "gyms"],
      ["User totals", "users"],
      ["Pending requests", "requests"],
    ]) {
      const link = within(nav).getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(`#${target}`);
      expect(document.getElementById(target)).toBeTruthy();
    }
  });

  it("shows a loading state without presenting unknown counts as zero", async () => {
    vi.mocked(fetchAdminDashboard).mockImplementation(
      () => new Promise(() => {}),
    );
    renderDashboard();

    expect(await screen.findByText("Loading dashboard counts...")).toBeTruthy();
    const totals = screen.getByRole("region", { name: "Platform totals" });
    expect(totals.getAttribute("aria-busy")).toBe("true");
    expect(within(totals).getAllByText("—")).toHaveLength(3);
    expect(within(totals).queryByText("0")).toBeNull();
  });

  it("displays real zero counts and the empty gym and request messages", async () => {
    vi.mocked(fetchAdminDashboard).mockResolvedValue({
      gyms: { total: 0, active: 0, pending: 0, inactive: 0 },
      users: { total: 1, admins: 1, gymAdmins: 0, climbers: 0 },
      pendingRequests: { total: 0, newGyms: 0, existingGyms: 0 },
    });
    renderDashboard();

    expect(await screen.findByText("No registered gyms yet.")).toBeTruthy();
    expect(
      screen.getByText("No pending requests. You're all caught up."),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("link", { name: /Total gyms/ })).getByText("0"),
    ).toBeTruthy();
  });

  it("shows a readable load failure and lets an admin retry", async () => {
    vi.mocked(fetchAdminDashboard)
      .mockRejectedValueOnce(
        new ApiError(
          0,
          "NETWORK_ERROR",
          "Couldn't reach the server. Check your connection and try again.",
        ),
      )
      .mockResolvedValueOnce(summary);
    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Couldn't reach the server."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await within(screen.getByRole("link", { name: /Total gyms/ })).findByText(
        "12",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchAdminDashboard).toHaveBeenCalledTimes(2);
  });

  it("reloads counts on refresh and clears the previous totals if that read fails", async () => {
    vi.mocked(fetchAdminDashboard)
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(
        new ApiError(
          500,
          "INTERNAL_ERROR",
          "Something went wrong. Please try again.",
        ),
      );
    renderDashboard();
    await within(
      await screen.findByRole("link", { name: /Total gyms/ }),
    ).findByText("12");

    fireEvent.click(screen.getByRole("button", { name: "Refresh counts" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Something went wrong."),
    );
    expect(
      within(
        screen.getByRole("region", { name: "Platform totals" }),
      ).getAllByText("—"),
    ).toHaveLength(3);
    expect(screen.queryByText("12")).toBeNull();
  });

  it("hides technical details when an unexpected error occurs", async () => {
    vi.mocked(fetchAdminDashboard).mockRejectedValue(
      new Error("internal database connection details"),
    );
    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining(
        "Couldn't load dashboard counts. Please try again.",
      ),
    );
    expect(screen.queryByText(/internal database/)).toBeNull();
  });

  it.each(["CLIMBER", "GYM_ADMIN"] as const)(
    "keeps %s accounts out of the admin overview and makes no dashboard API call",
    async (role) => {
      vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue(
        currentUser(role),
      );
      renderDashboard();

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: role === "GYM_ADMIN" ? "Gym admin dashboard" : "Successfully logged in",
        }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("heading", { level: 1, name: "Admin dashboard" }),
      ).toBeNull();
      expect(fetchAdminDashboard).not.toHaveBeenCalled();
    },
  );

  it("redirects visitors to login without requesting admin counts", async () => {
    vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
      csrfToken: "csrf-for-tests",
      sessionCookie: false,
    });
    renderDashboard();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeTruthy();
    expect(fetchAdminDashboard).not.toHaveBeenCalled();
  });

  it("cancels a dashboard read when the page closes", async () => {
    vi.mocked(fetchAdminDashboard).mockImplementation(
      () => new Promise(() => {}),
    );
    const view = renderDashboard();
    await screen.findByText("Loading dashboard counts...");
    const signal = vi.mocked(fetchAdminDashboard).mock.calls[0][0];

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("keeps the administrator logout connected to the shared login session", async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText("You're logged out.")).toBeTruthy();
    expect(sessionApi.logOut).toHaveBeenCalledWith("csrf-for-tests");
  });
});
