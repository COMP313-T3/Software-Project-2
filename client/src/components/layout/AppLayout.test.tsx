import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import { clearAppStorage } from "../../lib/appStorage.ts";
import AppLayout from "./AppLayout.tsx";

const logOut = vi.fn<() => Promise<void>>();
let role = "ADMIN";
vi.mock("../session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "account-id", role, email: "person@example.com" }, logOut }),
}));

function renderAt(path: string, title = "Gym details", loginSucceededAt?: number) {
  const { pathname, search, hash } = new URL(path, "http://localhost");
  return render(
    <MemoryRouter initialEntries={[{ pathname, search, hash, state: loginSucceededAt ? { loginSucceededAt } : undefined }]}>
      <AppLayout title={title}>
        <p>Page content</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

function linkTexts(container: HTMLElement) {
  return within(container).getAllByRole("link").map((link) => link.textContent);
}

beforeEach(() => {
  role = "ADMIN";
  logOut.mockReset().mockResolvedValue(undefined);
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the layout around System Administrator and Gym Administrator pages", () => {
  it("dismisses a fresh login confirmation automatically without blocking the page", () => {
    const now = new Date("2026-10-17T12:00:00Z").getTime(); vi.useFakeTimers({ now });
    renderAt("/competitions", "Discover competitions", now);
    expect(screen.getByRole("status").textContent).toBe("Successfully logged in");
    expect(screen.getByText("Page content")).toBeTruthy();
    act(() => vi.advanceTimersByTime(5000)); expect(screen.queryByText("Successfully logged in")).toBeNull();
  });
  it("shows the page title as the only h1, with Log out in the same top bar", () => {
    renderAt("/admin/gyms/gym-1");
    const banner = screen.getByRole("banner");
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Gym details"]);
    expect(within(banner).getByRole("heading", { level: 1 })).toBeTruthy();
    expect(within(banner).getByRole("button", { name: "Log out" })).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("Page content");
    expect(screen.getByRole("link", { name: "Skip to main content" }).getAttribute("href")).toBe("#main-content");
  });

  it("lists a System Administrator's pages and marks the section a gym's details belong to", () => {
    renderAt("/admin/gyms/gym-1");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(linkTexts(nav)).toEqual(["Dashboard", "Gyms", "Gym requests", "Users", "System settings"]);
    expect(within(nav).getByRole("link", { name: "Gyms" }).getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("person@example.com")).toBeTruthy();
    expect(screen.getByText("System Administrator")).toBeTruthy();
  });

  it("marks Gym requests on the list and while one request's details are open", () => {
    renderAt("/admin/gym-requests", "Gym requests");
    let nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Gym requests" }).getAttribute("href")).toBe("/admin/gym-requests");
    expect(within(nav).getByRole("link", { name: "Gym requests" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Gyms" }).getAttribute("aria-current")).toBeNull();
    cleanup();

    renderAt("/admin/gym-requests/request-1", "Gym request");
    nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Gym requests" }).getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Gyms" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks System settings as the current page", () => {
    renderAt("/admin/settings", "System settings");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav).getByRole("link", { name: "System settings" }).getAttribute("href"),
    ).toBe("/admin/settings");
    expect(
      within(nav).getByRole("link", { name: "System settings" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps a Gym Administrator's competition filters in every link", () => {
    role = "GYM_ADMIN";
    renderAt("/gym-admin/competitions/new?period=past&gymId=gym-1", "Create competition");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard?period=past&gymId=gym-1",
      "/dashboard?period=past&gymId=gym-1#competitions",
      "/gym-admin/competitions/new?period=past&gymId=gym-1",
      "/gym-admin/history?gymId=gym-1",
    ]);
    expect(within(nav).getByRole("link", { name: "Create competition" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Gym Administrator")).toBeTruthy();
  });

  it("marks Competitions while a competition's details are open", () => {
    role = "GYM_ADMIN";
    renderAt("/gym-admin/competitions/competition-1", "Autumn Open");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Competitions" }).getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps route selection local to statistics while retaining competition-list filters (US-022)", () => {
    role = "GYM_ADMIN";
    renderAt("/gym-admin/competitions/event-1/statistics?period=past&routeId=route-of-event-1&gymId=gym-1&page=2", "Route statistics");
    const expected = [
      "/dashboard?period=past&gymId=gym-1&page=2",
      "/dashboard?period=past&gymId=gym-1&page=2#competitions",
      "/gym-admin/competitions/new?period=past&gymId=gym-1&page=2",
      "/gym-admin/history?gymId=gym-1",
    ];
    expect(within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(expected);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(within(screen.getByRole("dialog", { name: "Menu" })).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(expected);
  });

  it("opens the phone menu with the same links and gives focus back to the menu button", () => {
    renderAt("/dashboard", "Admin dashboard");
    const menuButton = screen.getByRole("button", { name: "Open menu" });
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(menuButton);
    const menu = screen.getByRole("dialog", { name: "Menu" });
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    expect(menuButton.getAttribute("aria-controls")).toBe(menu.id);
    expect(linkTexts(menu)).toEqual(["Dashboard", "Gyms", "Gym requests", "Users", "System settings"]);
    expect(within(menu).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(within(menu).getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);
  });

  it("closes the phone menu with Esc and after a link is chosen", () => {
    renderAt("/dashboard", "Admin dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Gyms" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Gyms" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("logs out from the top bar, and explains a failed log out so it can be tried again", async () => {
    logOut.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."));
    renderAt("/dashboard", "Admin dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't reach the server.");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(logOut).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("collapsing the sidebar on a desktop", () => {
  const sideLinks = () => within(screen.getByRole("navigation", { name: "Main" })).queryAllByRole("link").map((link) => link.textContent);
  const collapse = () => fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
  const expand = () => fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));

  it.each([
    ["ADMIN", "/dashboard", "Dashboard"],
    ["GYM_ADMIN", "/dashboard", "Dashboard"],
    ["CLIMBER", "/my-events", "Discover competitions"],
  ])("lets a %s collapse it to a slim strip with the TopSend mark, and open it again", (account, path, firstLink) => {
    role = account;
    renderAt(path, "Page");
    const button = screen.getByRole("button", { name: "Collapse menu" });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const list = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(list?.tagName).toBe("UL");
    expect(within(list!).getAllByRole("link")[0].textContent).toBe(firstLink);

    collapse();

    expect(button.getAttribute("aria-label")).toBe("Expand menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(sideLinks()).toEqual([]);
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("img", { name: "TopSend" })).toBeTruthy();
    expect(screen.getByText("person@example.com").closest("[hidden]")).not.toBeNull();

    expand();

    expect(sideLinks()[0]).toBe(firstLink);
    expect(screen.getByText("person@example.com").closest("[hidden]")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the button, and the focus on it, in the same place", () => {
    renderAt("/dashboard", "Admin dashboard");
    const button = screen.getByRole("button", { name: "Collapse menu" });
    button.focus();

    collapse();

    expect(screen.getByRole("button", { name: "Expand menu" })).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("keeps the choice on every page in this browser, until logging out clears it", () => {
    renderAt("/dashboard", "Admin dashboard");
    collapse();
    cleanup();

    renderAt("/admin/gyms", "Gyms");
    expect(sideLinks()).toEqual([]);
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeTruthy();
    cleanup();

    clearAppStorage();
    renderAt("/dashboard", "Admin dashboard");
    expect(sideLinks().length).toBeGreaterThan(0);
  });

  it("keeps the choice from page to page when the browser's storage can't be used", () => {
    const blocked = (["getItem", "setItem", "removeItem"] as const).map((method) =>
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      }),
    );
    try {
      renderAt("/dashboard", "Admin dashboard");
      collapse();
      cleanup();

      renderAt("/admin/gyms", "Gyms");
      expect(sideLinks()).toEqual([]);
      expand();
      expect(sideLinks().length).toBeGreaterThan(0);
    } finally {
      for (const spy of blocked) spy.mockRestore();
    }
  });

  it("leaves the phone menu with every link while the sidebar is collapsed", () => {
    renderAt("/dashboard", "Admin dashboard");
    collapse();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(linkTexts(screen.getByRole("dialog", { name: "Menu" }))).toEqual([
      "Dashboard",
      "Gyms",
      "Gym requests",
      "Users",
      "System settings",
    ]);
  });
});
