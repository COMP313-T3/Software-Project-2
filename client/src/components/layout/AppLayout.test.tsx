import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import AppLayout from "./AppLayout.tsx";

const logOut = vi.fn<() => Promise<void>>();
let role = "ADMIN";
vi.mock("../session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId: "account-id", role, email: "person@example.com" }, logOut }),
}));

function renderAt(path: string, title = "Gym details") {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
});
afterEach(cleanup);

describe("the layout around System Administrator and Gym Administrator pages", () => {
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
    expect(linkTexts(nav)).toEqual(["Dashboard", "Gyms"]);
    expect(within(nav).getByRole("link", { name: "Gyms" }).getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByText("person@example.com")).toBeTruthy();
    expect(screen.getByText("System Administrator")).toBeTruthy();
  });

  it("keeps a Gym Administrator's competition filters in every link", () => {
    role = "GYM_ADMIN";
    renderAt("/gym-admin/competitions/new?period=past&gymId=gym-1", "Create competition");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard?period=past&gymId=gym-1",
      "/dashboard?period=past&gymId=gym-1#competitions",
      "/gym-admin/competitions/new?period=past&gymId=gym-1",
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

  it("opens the phone menu with the same links and gives focus back to the menu button", () => {
    renderAt("/dashboard", "Admin dashboard");
    const menuButton = screen.getByRole("button", { name: "Open menu" });
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(menuButton);
    const menu = screen.getByRole("dialog", { name: "Menu" });
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
    expect(menuButton.getAttribute("aria-controls")).toBe(menu.id);
    expect(linkTexts(menu)).toEqual(["Dashboard", "Gyms"]);
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
