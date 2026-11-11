import { configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { forgetOnboarding } from "../lib/onboarding.ts";
import { forgetSession } from "../lib/sessionClient.ts";

// Every test starts logged out, without reaching a server. Tests about logging in set what the
// session API answers.
vi.mock("../lib/sessionApi.ts", async () => {
  const { ApiError } = await import("../lib/apiClient.ts");
  const loggedOut = async () => {
    throw new ApiError(401, "NOT_AUTHENTICATED", "Log in to continue.");
  };
  return {
    fetchCsrfToken: vi.fn(async () => ({
      csrfToken: "csrf-token-for-tests",
      sessionCookie: false,
    })),
    logIn: vi.fn(async () => {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }),
    refreshSession: vi.fn(loggedOut),
    logOut: vi.fn(async () => undefined),
    fetchCurrentUser: vi.fn(loggedOut),
    pingSession: vi.fn(loggedOut),
  };
});

// Every account has already seen the onboarding tutorial, so it doesn't open over the page under
// test. Tests about the tutorial set what the onboarding API answers.
vi.mock("../lib/onboardingApi.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/onboardingApi.ts")>();
  const seen = { seen: true, seenAt: "2026-11-09T15:00:00.000Z" };
  return {
    ...actual,
    getOnboarding: vi.fn(async () => seen),
    markOnboardingSeen: vi.fn(async () => seen),
  };
});

// No page under test opens a live connection for page updates. Tests about them set what
// followChanges does, and the tests of the connection itself use the real one.
vi.mock("../lib/liveChanges.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/liveChanges.ts")>();
  return { ...actual, followChanges: vi.fn(() => () => undefined) };
});

afterEach(() => {
  forgetSession();
  forgetOnboarding();
});

// Tests never use the keys in a developer's .env, so they behave the same on every machine.
const KEYS_FROM_ENV = [
  "VITE_RECAPTCHA_SITE_KEY",
  "VITE_GOOGLE_MAPS_API_KEY",
  "VITE_GOOGLE_MAPS_MAP_ID",
];

function clearEnvKeys() {
  for (const name of KEYS_FROM_ENV) vi.stubEnv(name, "");
}

clearEnvKeys();
beforeEach(clearEnvKeys);

// Slower machines can need more than the defaults for a step-by-step sign-up to settle.
configure({ asyncUtilTimeout: 3000 });
vi.setConfig({ testTimeout: 20000 });

// jsdom has no matchMedia, ResizeObserver, or dialog methods. Tests report reduced motion so the login mascot stays still.
function matchMedia(query: string): MediaQueryList {
  return {
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

class ResizeObserverStub {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
}

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
}

if (!window.ResizeObserver) {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}

if (!HTMLDialogElement.prototype.show) {
  HTMLDialogElement.prototype.show = function show() {
    this.setAttribute("open", "");
  };
}

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
