import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import { getOnboarding, markOnboardingSeen } from "../../lib/onboardingApi.ts";
import AppLayout from "../layout/AppLayout.tsx";

let role = "CLIMBER";
let userId = "climber-one";
vi.mock("../session/sessionContext.ts", () => ({
  useSession: () => ({ user: { userId, role, email: "person@example.com" }, logOut: vi.fn() }),
}));

const NOT_SEEN = { seen: false, seenAt: null };
const SEEN = { seen: true, seenAt: "2026-11-09T15:00:00.000Z" };
const wide = window.innerWidth;

function renderPage(path = "/my-events") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout title="Page">
        <p>Page content</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

const tour = () => screen.findByRole("dialog");
const title = (dialog: HTMLElement) => within(dialog).getByRole("heading", { level: 2 }).textContent;
const next = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: /^(Next|Finish)$/ }));

/** Puts the controls with these data-tour names on screen at these places; everything else is hidden. */
function onScreen(places: Record<string, [number, number, number, number]>) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const place = places[this.getAttribute("data-tour") ?? ""];
    const [left, top, width, height] = place ?? [0, 0, 0, 0];
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
  });
}

function screenWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

beforeEach(() => {
  role = "CLIMBER";
  userId = "climber-one";
  window.localStorage.clear();
  vi.mocked(getOnboarding).mockReset().mockResolvedValue(NOT_SEEN);
  vi.mocked(markOnboardingSeen).mockReset().mockResolvedValue(SEEN);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  screenWidth(wide);
});

describe("US-037 the onboarding tutorial opening by itself", () => {
  it.each([
    [
      "CLIMBER",
      ["Welcome to TopSend", "Discover competitions", "My Events", "Topo, your AI Route Assistant", "Onboarding tips"],
    ],
    [
      "GYM_ADMIN",
      [
        "Welcome to TopSend",
        "Dashboard",
        "Competitions",
        "Create competition",
        "Competition history",
        "Topo, your AI Route Assistant",
        "Onboarding tips",
      ],
    ],
    [
      "ADMIN",
      ["Welcome to TopSend", "Dashboard", "Gyms", "Gym requests", "Users", "System settings", "Onboarding tips"],
    ],
  ])("opens for a %s who hasn't seen it, with only their role's features", async (account, titles) => {
    role = account;
    userId = `${account}-one`;
    renderPage("/dashboard");

    const dialog = await tour();
    const seen: string[] = [];
    for (let step = 1; step <= titles.length; step += 1) {
      expect(within(dialog).getByText(`Step ${step} of ${titles.length}`)).toBeTruthy();
      seen.push(title(dialog) ?? "");
      next(dialog);
    }

    expect(seen).toEqual(titles);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(markOnboardingSeen).toHaveBeenCalledOnce());
  });

  it("doesn't open for an account that has seen it", async () => {
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    renderPage();

    await waitFor(() => expect(getOnboarding).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Page content")).toBeTruthy();
  });

  it("asks the account once while the user moves from page to page", async () => {
    renderPage();
    fireEvent.click(within(await tour()).getByRole("button", { name: "Skip tour" }));
    cleanup();

    renderPage("/competitions");
    await act(async () => {});

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getOnboarding).toHaveBeenCalledOnce();
  });

  it("doesn't open when the account's answer can't be read, and asks again on the next page", async () => {
    vi.mocked(getOnboarding).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."));
    renderPage();
    await waitFor(() => expect(getOnboarding).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    renderPage("/competitions");

    expect(await tour()).toBeTruthy();
    expect(getOnboarding).toHaveBeenCalledTimes(2);
  });
});

describe("US-037 moving through the tutorial", () => {
  it("goes forward and back, and Skip tour ends it at any step", async () => {
    renderPage();
    const dialog = await tour();

    next(dialog);
    next(dialog);
    expect(title(dialog)).toBe("My Events");
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(title(dialog)).toBe("Discover competitions");

    fireEvent.click(within(dialog).getByRole("button", { name: "Skip tour" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(markOnboardingSeen).toHaveBeenCalledOnce());
  });

  it("has no Back on the first step and no Skip tour on the last", async () => {
    renderPage();
    const dialog = await tour();

    expect(within(dialog).queryByRole("button", { name: "Back" })).toBeNull();
    for (let step = 1; step < 5; step += 1) next(dialog);

    expect(within(dialog).queryByRole("button", { name: "Skip tour" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Finish" })).toBeTruthy();
  });

  it("ends with Esc", async () => {
    renderPage();
    const dialog = await tour();

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(markOnboardingSeen).toHaveBeenCalledOnce());
  });

  it("still closes, and doesn't open again on the next page, when saving that it was seen fails", async () => {
    vi.mocked(markOnboardingSeen).mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."));
    renderPage();
    fireEvent.click(within(await tour()).getByRole("button", { name: "Skip tour" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    renderPage("/competitions");
    await act(async () => {});

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("US-037 the spotlight", () => {
  it("frames the control a step is about, with the card beside it", async () => {
    onScreen({ "nav-discover-competitions": [12, 100, 216, 44] });
    renderPage();
    const dialog = await tour();

    next(dialog);

    const hole = dialog.querySelector<HTMLElement>("[class*='hole']");
    expect(hole?.style.left).toBe("6px");
    expect(hole?.style.top).toBe("94px");
    expect(hole?.style.width).toBe("228px");
    expect(hole?.style.height).toBe("56px");
    const card = within(dialog).getByRole("heading", { level: 2 }).parentElement!;
    expect(card.style.left).toBe("248px");
  });

  it("dims the page without a spotlight when the control isn't on this page", async () => {
    onScreen({});
    renderPage();
    const dialog = await tour();

    for (let step = 1; step < 4; step += 1) next(dialog);

    expect(title(dialog)).toBe("Topo, your AI Route Assistant");
    expect(dialog.querySelector("[class*='hole']")).toBeNull();
    expect(dialog.hasAttribute("data-dim")).toBe(true);
  });

  it("on a phone, spotlights the menu button for a menu link and says it's in the menu", async () => {
    screenWidth(390);
    onScreen({ menu: [330, 6, 44, 44] });
    renderPage();
    const dialog = await tour();

    next(dialog);

    const where = within(dialog).getByText("It's in the menu.");
    expect(dialog.getAttribute("aria-describedby")).toContain(where.id);
    expect(dialog.querySelector<HTMLElement>("[class*='hole']")?.style.left).toBe("324px");
    expect(within(dialog).getByRole("heading", { level: 2 }).parentElement?.dataset.dock).toBe("bottom");
  });

  it("shows the whole sidebar during the tutorial, and keeps a collapsed sidebar collapsed after it", async () => {
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    expect(screen.queryByRole("navigation", { name: "Main", hidden: false })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Onboarding tips" }));
    const dialog = await tour();
    expect(document.querySelector("nav#side-nav")?.hasAttribute("hidden")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Skip tour" }));

    expect(document.querySelector("nav#side-nav")?.hasAttribute("hidden")).toBe(true);
  });
});

describe("US-037 Onboarding tips", () => {
  it("opens the tutorial again from the top bar, without telling the account again", async () => {
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    renderPage();
    await act(async () => {});
    const tips = screen.getByRole("button", { name: "Onboarding tips" });

    fireEvent.click(tips);
    const dialog = await tour();
    expect(title(dialog)).toBe("Welcome to TopSend");
    for (let step = 1; step <= 5; step += 1) next(dialog);

    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {});
    expect(markOnboardingSeen).not.toHaveBeenCalled();
  });

  it("opens the tutorial from the phone menu", async () => {
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    renderPage();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Menu" })).getByRole("button", { name: "Onboarding tips" }),
    );

    const dialog = await tour();
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(title(dialog)).toBe("Welcome to TopSend");
  });
});

describe("US-037 the tutorial with a keyboard and a screen reader", () => {
  it("is named by its step, starts on Next, and announces each new step", async () => {
    renderPage();
    const dialog = await tour();

    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Welcome to TopSend",
    );
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
      "Here's a quick look",
    );
    const nextButton = within(dialog).getByRole("button", { name: "Next" });
    expect(document.activeElement).toBe(nextButton);

    fireEvent.click(nextButton);

    expect(dialog.querySelector("[aria-live='polite']")?.textContent).toBe(
      "Step 2 of 5: Discover competitions. Find upcoming bouldering competitions, see where and when they are, and register for one.",
    );
  });

  it("puts focus on Next after going back to the first step", async () => {
    renderPage();
    const dialog = await tour();
    next(dialog);
    const back = within(dialog).getByRole("button", { name: "Back" });
    back.focus();

    fireEvent.click(back);

    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Next" }));
  });

  it("gives focus back to Onboarding tips when it ends", async () => {
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    renderPage();
    await act(async () => {});
    const tips = screen.getByRole("button", { name: "Onboarding tips" });
    tips.focus();

    fireEvent.click(tips);
    fireEvent.click(within(await tour()).getByRole("button", { name: "Skip tour" }));

    expect(document.activeElement).toBe(tips);
  });
});
