import { ROLES } from "../constants/roles.ts";
import { getOnboarding, markOnboardingSeen } from "./onboardingApi.ts";

/** The layout's phone breakpoint: narrower screens keep the menu links behind the menu button. */
export const PHONE_WIDTH = 768;

/** One step of the onboarding tutorial. */
export interface TourStep {
  title: string;
  text: string;
  /** The data-tour name of the control the step spotlights, when it's about one. */
  target?: string;
  /** True when the control is behind the menu button on a phone. */
  inMenu?: boolean;
  /** True for a step about something only a phone has, which a larger screen leaves out. */
  phoneOnly?: boolean;
}

const WELCOME: TourStep = {
  title: "Welcome to TopSend",
  text: "Here's a quick look at where everything is. You can skip it at any time, and watch it again from Onboarding tips.",
};

const TIPS: TourStep = {
  title: "Onboarding tips",
  text: "Watch this tour again whenever you need a reminder.",
  target: "tips",
  inMenu: true,
};

const CIRCLES: TourStep = {
  title: "Recording your attempts",
  text: "On your scorecard, each problem has a circle for every attempt you're allowed. Tap a circle to mark your attempts, and choose Sent it when you top out. Tap your last marked circle again to clear it.",
  target: "attempts",
};

/** A step about the sections that fold into a bar, which only happens on a phone. */
function foldsStep(text: string): TourStep {
  return { title: "Sections that fold away", text, target: "fold", phoneOnly: true };
}

/**
 * The data-tour name of a menu link, made from its label: "My Events" is "nav-my-events".
 *
 * @param label The link's text.
 */
export function navTarget(label: string): string {
  return `nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function menuStep(label: string, text: string): TourStep {
  return { title: label, text, target: navTarget(label), inMenu: true };
}

const STEPS: Record<string, TourStep[]> = {
  [ROLES.CLIMBER]: [
    WELCOME,
    menuStep(
      "Discover competitions",
      "Find upcoming bouldering competitions, see where and when they are, and register for one.",
    ),
    menuStep(
      "My Events",
      "Your registered competitions. Check your registration status, and once a competition starts, open your scorecard and the live leaderboard.",
    ),
    CIRCLES,
    {
      title: "Topo, your AI Route Assistant",
      text: "On your scorecard and the leaderboard, Topo peeks up at the bottom right. Choose him to ask which problem to try next or where you stand.",
      target: "ask-ai",
    },
    foldsStep(
      "On your phone, the details above your scorecard's problems and the leaderboard's standings fold into a bar, so you reach them sooner. Tap a bar to open it, and tap it again to fold it.",
    ),
    TIPS,
  ],
  [ROLES.GYM_ADMIN]: [
    WELCOME,
    menuStep("Dashboard", "Your gyms, your next competition, and your upcoming and past competitions at a glance."),
    menuStep(
      "Competitions",
      "Every competition at your gyms. Open one to set up its divisions, routes and scoring, enter results, and see its route statistics and live leaderboard.",
    ),
    menuStep("Create competition", "Set up a new competition with its date, start time, divisions and scoring."),
    menuStep("Competition history", "Review saved results and route performance from past events at your gyms."),
    {
      title: "Topo, your AI Route Assistant",
      text: "On Route statistics, Result entry and the Live leaderboard, Topo peeks up at the bottom right. Choose him to ask how the problems performed.",
      target: "ask-ai",
    },
    foldsStep(
      "On your phone, the competition's details above the Live leaderboard's standings fold into a bar, so you reach the standings sooner. Tap the bar to open it, and tap it again to fold it.",
    ),
    TIPS,
  ],
  [ROLES.ADMIN]: [
    WELCOME,
    menuStep("Dashboard", "TopSend's totals at a glance, and how they break down."),
    menuStep("Gyms", "Register climbing gyms and keep the gym directory up to date."),
    menuStep("Gym requests", "Review the requests from gyms that want to join TopSend, and approve or reject them."),
    menuStep("Users", "Find registered accounts and review their information."),
    menuStep("System settings", "Change TopSend's display name, and choose whether new Climbers can sign up."),
    foldsStep(
      "On your phone, the filters and sorting above the Manage users list fold into a bar, so you reach the accounts sooner. Tap the bar to open it, and tap it again to fold it.",
    ),
    TIPS,
  ],
};

/**
 * The tutorial's steps for a role. Each role only sees the features it can use, and a step about
 * something only a phone has is left out on a larger screen.
 *
 * @param role The logged-in user's role.
 * @param phone Whether the tutorial is shown on a phone.
 */
export function tourSteps(role: string | undefined, phone = false): TourStep[] {
  const steps = (role && STEPS[role]) || [];
  return phone ? steps : steps.filter((step) => !step.phoneOnly);
}

/** What's known about the logged-in user's tutorial, so every page doesn't ask the API again. */
let known: { userId: string; seen: Promise<boolean> } | null = null;

/**
 * Whether the user has seen the tutorial, read from the account once while they stay in TopSend.
 * A failed read is tried again on the next page.
 *
 * @param userId The logged-in user.
 */
export function hasSeenOnboarding(userId: string): Promise<boolean> {
  if (known?.userId !== userId) {
    const seen = getOnboarding().then((state) => state.seen);
    const entry = { userId, seen };
    known = entry;
    seen.catch(() => {
      if (known === entry) known = null;
    });
  }
  return known.seen;
}

/**
 * Remembers that the user finished or skipped the tutorial. The account is only told the first
 * time, so watching it again from Onboarding tips changes nothing.
 *
 * @param userId The logged-in user.
 */
export function rememberOnboardingSeen(userId: string) {
  const before = known?.userId === userId ? known.seen : Promise.resolve(false);
  known = { userId, seen: Promise.resolve(true) };
  before
    .catch(() => false)
    .then((seen) => (seen ? undefined : markOnboardingSeen()))
    .catch(() => undefined);
}

/** Forgets what's known about the tutorial. Tests call it between cases. */
export function forgetOnboarding() {
  known = null;
}
