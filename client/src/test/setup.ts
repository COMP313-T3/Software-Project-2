import { configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
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

afterEach(() => {
  forgetSession();
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

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
