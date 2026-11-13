import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "../constants/roles.ts";
import { ApiError } from "./apiClient.ts";
import { forgetOnboarding, hasSeenOnboarding, navTarget, rememberOnboardingSeen, tourSteps } from "./onboarding.ts";
import { getOnboarding, markOnboardingSeen } from "./onboardingApi.ts";

const NOT_SEEN = { seen: false, seenAt: null };
const SEEN = { seen: true, seenAt: "2026-11-09T15:00:00.000Z" };

beforeEach(() => {
  forgetOnboarding();
  vi.mocked(getOnboarding).mockReset().mockResolvedValue(NOT_SEEN);
  vi.mocked(markOnboardingSeen).mockReset().mockResolvedValue(SEEN);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("US-037 each role's tutorial", () => {
  it.each([
    [ROLES.CLIMBER, ["nav-discover-competitions", "nav-my-events", "attempts", "ask-ai", "tips"]],
    [
      ROLES.GYM_ADMIN,
      ["nav-dashboard", "nav-competitions", "nav-create-competition", "nav-competition-history", "ask-ai", "tips"],
    ],
    [ROLES.ADMIN, ["nav-dashboard", "nav-gyms", "nav-gym-requests", "nav-users", "nav-system-settings", "tips"]],
  ])("starts with a welcome for a %s, then spotlights only their own features", (role, targets) => {
    const steps = tourSteps(role);

    expect(steps[0].title).toBe("Welcome to TopSend");
    expect(steps[0].target).toBeUndefined();
    expect(steps.slice(1).map((step) => step.target)).toEqual(targets);
    expect(steps.every((step) => step.text.length > 0)).toBe(true);
  });

  it("marks the steps whose controls are behind the menu button on a phone", () => {
    const steps = tourSteps(ROLES.CLIMBER);

    expect(steps.filter((step) => step.inMenu).map((step) => step.target)).toEqual([
      "nav-discover-competitions",
      "nav-my-events",
      "tips",
    ]);
  });

  it("explains the scorecard's attempt circles to a Climber, after My Events where the scorecard opens", () => {
    const steps = tourSteps(ROLES.CLIMBER);
    const circles = steps.find((step) => step.target === "attempts");

    expect(circles?.title).toBe("Recording your attempts");
    expect(circles?.text).toContain("Tap a circle to mark your attempts");
    expect(circles?.text).toContain("Tap your last marked circle again to clear it");
    expect(steps.indexOf(circles!)).toBe(steps.findIndex((step) => step.target === "nav-my-events") + 1);
    expect(tourSteps(ROLES.GYM_ADMIN).some((step) => step.target === "attempts")).toBe(false);
    expect(tourSteps(ROLES.ADMIN).some((step) => step.target === "attempts")).toBe(false);
  });

  it.each([ROLES.CLIMBER, ROLES.GYM_ADMIN, ROLES.ADMIN])(
    "explains the sections that fold away to a %s on a phone only, never on a larger screen",
    (role) => {
      const onPhone = tourSteps(role, true);
      const onDesktop = tourSteps(role);
      const folds = onPhone.filter((step) => step.phoneOnly);

      expect(folds.map((step) => [step.title, step.target])).toEqual([["Sections that fold away", "fold"]]);
      expect(folds[0].text).toContain("fold into a bar");
      expect(onDesktop.some((step) => step.phoneOnly || step.target === "fold")).toBe(false);
      expect(onDesktop).toEqual(onPhone.filter((step) => !step.phoneOnly));
      expect(onPhone.at(-1)?.target).toBe("tips");
    },
  );

  it("tells a System Administrator that it's the Manage users filters that fold", () => {
    expect(tourSteps(ROLES.ADMIN, true).find((step) => step.phoneOnly)?.text).toContain("Manage users");
  });

  it("has no tutorial for an unknown role", () => {
    expect(tourSteps("VISITOR")).toEqual([]);
    expect(tourSteps(undefined)).toEqual([]);
    expect(tourSteps("VISITOR", true)).toEqual([]);
  });

  it("names a menu link's spotlight after its label", () => {
    expect(navTarget("My Events")).toBe("nav-my-events");
    expect(navTarget("Gym requests")).toBe("nav-gym-requests");
  });
});

describe("US-037 remembering that the tutorial was seen", () => {
  it("asks the account once for the same user, and again for another", async () => {
    expect(await hasSeenOnboarding("one")).toBe(false);
    expect(await hasSeenOnboarding("one")).toBe(false);
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    expect(await hasSeenOnboarding("two")).toBe(true);

    expect(getOnboarding).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failed answer", async () => {
    vi.mocked(getOnboarding).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."));

    await expect(hasSeenOnboarding("one")).rejects.toThrow("Couldn't reach the server.");
    await settle();
    expect(await hasSeenOnboarding("one")).toBe(false);
    expect(getOnboarding).toHaveBeenCalledTimes(2);
  });

  it("tells the account the first time, and not when it's watched again", async () => {
    await hasSeenOnboarding("one");

    rememberOnboardingSeen("one");
    await settle();
    expect(markOnboardingSeen).toHaveBeenCalledOnce();
    expect(await hasSeenOnboarding("one")).toBe(true);

    rememberOnboardingSeen("one");
    await settle();
    expect(markOnboardingSeen).toHaveBeenCalledOnce();
  });

  it("doesn't tell the account when it already said it was seen", async () => {
    vi.mocked(getOnboarding).mockResolvedValue(SEEN);
    await hasSeenOnboarding("one");

    rememberOnboardingSeen("one");
    await settle();

    expect(markOnboardingSeen).not.toHaveBeenCalled();
  });

  it("keeps it seen for the rest of the visit even when telling the account fails", async () => {
    vi.mocked(markOnboardingSeen).mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."));
    await hasSeenOnboarding("one");

    rememberOnboardingSeen("one");
    await settle();

    expect(await hasSeenOnboarding("one")).toBe(true);
  });
});
