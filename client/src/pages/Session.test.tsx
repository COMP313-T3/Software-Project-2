import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import * as sessionApi from "../lib/sessionApi.ts";

const PASSWORD = "Chalk up & send it";
const MINUTE = 60 * 1000;
const START = new Date("2026-10-05T14:00:00Z").getTime();
const USER: sessionApi.CurrentUser = {
  userId: "507f1f77bcf86cd799439011",
  email: "jordan@example.com",
  role: "CLIMBER",
  session: { expiresIn: 3600, limitReached: false },
};
const EXPIRED_NOTICE = "Your session expired. Log in again to continue.";
const LOGGED_OUT_NOTICE = "You're logged out.";

function tokenResult(token: string): sessionApi.AccessTokenResult {
  return {
    userId: USER.userId,
    role: "CLIMBER",
    token,
    expiresAt: "2026-10-05T14:15:00.000Z",
  };
}

function AddressBar() {
  const { pathname, search } = useLocation();
  return <span data-testid="address">{`${pathname}${search}`}</span>;
}

function address() {
  return screen.getByTestId("address").textContent;
}

function renderAt(path: string) {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <AddressBar />
      </MemoryRouter>
    </StrictMode>,
  );
}

function field(label: string) {
  return within(screen.getByRole("tabpanel")).getByLabelText(
    label,
  ) as HTMLInputElement;
}

function submitLogin(email = "jordan@example.com", password = PASSWORD) {
  fireEvent.change(field("Email"), { target: { value: email } });
  fireEvent.change(field("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

function dashboardHeading() {
  return screen.findByRole("heading", {
    level: 1,
    name: "Successfully logged in",
  });
}

function hasRefreshCookie() {
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
    csrfToken: "csrf-1",
    sessionCookie: true,
  });
}

function loggedIn() {
  hasRefreshCookie();
  vi.mocked(sessionApi.refreshSession).mockResolvedValue(
    tokenResult("access-1"),
  );
}

async function flush(milliseconds = 0) {
  await act(() => vi.advanceTimersByTimeAsync(milliseconds));
}

beforeEach(() => {
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
    csrfToken: "csrf-1",
    sessionCookie: false,
  });
  vi.mocked(sessionApi.refreshSession).mockRejectedValue(
    new ApiError(401, "NOT_AUTHENTICATED", "Log in to continue."),
  );
  vi.mocked(sessionApi.logIn).mockResolvedValue(tokenResult("access-1"));
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue(USER);
  vi.mocked(sessionApi.pingSession).mockResolvedValue(USER.session);
  vi.mocked(sessionApi.logOut).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Logging in", () => {
  it("opens the dashboard, which says so with a Log out button under it", async () => {
    renderAt("/login");

    submitLogin();

    const heading = await dashboardHeading();
    const logOut = screen.getByRole("button", { name: "Log out" });
    expect(address()).toBe("/dashboard");
    expect(
      heading.compareDocumentPosition(logOut) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("jordan@example.com")).toBeTruthy();
    expect(document.title).toBe("Dashboard | TopSend");
    expect(sessionApi.logIn).toHaveBeenCalledWith(
      "jordan@example.com",
      PASSWORD,
      "csrf-1",
    );
    expect(sessionApi.fetchCurrentUser).toHaveBeenCalledWith("access-1");
  });

  it("keeps the access token out of browser storage and cookies", async () => {
    renderAt("/login");

    submitLogin();
    await dashboardHeading();

    const stored = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(stored).not.toContain("access-1");
    expect(document.cookie).not.toContain("access-1");
  });

  it("keeps both fields and says why when the email or password is wrong", async () => {
    vi.mocked(sessionApi.logIn).mockRejectedValue(
      new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      ),
    );
    renderAt("/login");

    submitLogin();

    expect(
      await screen.findByText("Email or password is incorrect."),
    ).toBeTruthy();
    expect(address()).toBe("/login");
    expect(field("Email").value).toBe("jordan@example.com");
    expect(field("Password").value).toBe(PASSWORD);
    expect(document.activeElement).toBe(field("Password"));
  });

  it("shows the lock message after too many failed tries", async () => {
    vi.mocked(sessionApi.logIn).mockRejectedValue(
      new ApiError(
        429,
        "LOGIN_LOCKED",
        "Too many failed attempts. Try again in 15 minutes.",
      ),
    );
    renderAt("/login");

    submitLogin();

    expect(
      await screen.findByText(
        "Too many failed attempts. Try again in 15 minutes.",
      ),
    ).toBeTruthy();
  });

  it("skips log in and create account for someone already logged in", async () => {
    loggedIn();

    for (const path of ["/login", "/register"]) {
      renderAt(path);
      await dashboardHeading();
      expect(address()).toBe("/dashboard");
      cleanup();
    }
  });

  it("ignores a returnTo that leads to another site", async () => {
    renderAt("/login?returnTo=%2F%2Felsewhere.example");

    submitLogin();

    await dashboardHeading();
    expect(address()).toBe("/dashboard");
  });
});

describe("The dashboard", () => {
  it("sends someone who isn't logged in to log in, then back", async () => {
    renderAt("/dashboard");

    await screen.findByRole("heading", { level: 1, name: "Welcome back" });
    expect(address()).toBe("/login?returnTo=%2Fdashboard");
    expect(document.getElementById("loginStatus")?.textContent).toBe("");

    submitLogin();

    await dashboardHeading();
    expect(address()).toBe("/dashboard");
  });

  it("says the session expired when the login ended while the app was closed", async () => {
    hasRefreshCookie();
    vi.mocked(sessionApi.refreshSession).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", EXPIRED_NOTICE),
    );

    renderAt("/dashboard");

    expect(await screen.findByText(EXPIRED_NOTICE)).toBeTruthy();
    expect(address()).toBe("/login?reason=expired&returnTo=%2Fdashboard");
  });

  it("logs out, then says so on the log in page", async () => {
    loggedIn();
    renderAt("/dashboard");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText(LOGGED_OUT_NOTICE)).toBeTruthy();
    expect(address()).toBe("/login");
    expect(sessionApi.logOut).toHaveBeenCalledWith("csrf-1");
  });

  it("stays when logging out can't reach the server, and says why", async () => {
    loggedIn();
    vi.mocked(sessionApi.logOut).mockRejectedValue(
      new ApiError(
        0,
        "NETWORK_ERROR",
        "Couldn't reach the server. Check your connection and try again.",
      ),
    );
    renderAt("/dashboard");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(
      await screen.findByText(
        "Couldn't reach the server. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(address()).toBe("/dashboard");
  });

  it("wipes what the app keeps in this browser when logging out", async () => {
    loggedIn();
    localStorage.setItem("topsend.draft", "half typed");
    localStorage.setItem("someone-else", "keep");
    renderAt("/dashboard");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));
    await screen.findByText(LOGGED_OUT_NOTICE);

    expect(localStorage.getItem("topsend.draft")).toBeNull();
    expect(localStorage.getItem("someone-else")).toBe("keep");
  });

  it("explains the Log out button in a tooltip that Esc hides", async () => {
    loggedIn();
    renderAt("/dashboard");
    const button = await screen.findByRole("button", { name: "Log out" });
    const tooltip = document.getElementById(
      button.getAttribute("aria-describedby") ?? "",
    );

    expect(tooltip?.textContent).toBe(
      "Ends your session on this device. You'll need your password to log back in.",
    );
    expect(tooltip?.hidden).toBe(true);
    act(() => button.focus());
    expect(tooltip?.hidden).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tooltip?.hidden).toBe(true);
  });
});

describe("Session timeout", () => {
  it("warns 2 minutes before an idle session ends, and Stay logged in keeps it going", async () => {
    vi.useFakeTimers({ now: START });
    loggedIn();
    renderAt("/dashboard");
    await flush();

    await flush(58 * MINUTE);

    const dialog = screen.getByRole("alertdialog", {
      name: "You'll be logged out soon",
    });
    const stay = within(dialog).getByRole("button", {
      name: "Stay logged in",
    });
    expect(within(dialog).getByText("2:00")).toBeTruthy();
    expect(document.activeElement).toBe(stay);
    await flush(1000);
    expect(within(dialog).getByText("1:59")).toBeTruthy();

    fireEvent.click(stay);
    await flush();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sessionApi.pingSession).toHaveBeenLastCalledWith("access-1", 0);
    expect(address()).toBe("/dashboard");
  });

  it("Esc keeps the session going, even when the browser closes the dialog on a second Esc", async () => {
    vi.useFakeTimers({ now: START });
    loggedIn();
    renderAt("/dashboard");
    await flush();

    await flush(58 * MINUTE);
    fireEvent(
      screen.getByRole("alertdialog"),
      new Event("cancel", { cancelable: true }),
    );
    await flush();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sessionApi.pingSession).toHaveBeenCalledTimes(1);

    await flush(58 * MINUTE);
    act(() => (screen.getByRole("alertdialog") as HTMLDialogElement).close());
    await flush();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sessionApi.pingSession).toHaveBeenCalledTimes(2);
  });

  it("logs out when the countdown ends and the server agrees, and says why on the log in page", async () => {
    vi.useFakeTimers({ now: START });
    loggedIn();
    renderAt("/dashboard");
    await flush();
    vi.mocked(sessionApi.pingSession).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", EXPIRED_NOTICE),
    );

    await flush(60 * MINUTE);

    expect(screen.getByText(EXPIRED_NOTICE)).toBeTruthy();
    expect(address()).toBe("/login?reason=expired&returnTo=%2Fdashboard");
    expect(sessionApi.logOut).toHaveBeenCalled();
  });

  it("keeps the session going while the user is active, without a warning", async () => {
    vi.useFakeTimers({ now: START });
    loggedIn();
    renderAt("/dashboard");
    await flush();

    for (let minute = 1; minute <= 90; minute += 1) {
      await flush(MINUTE);
      fireEvent.pointerDown(document.body);
    }

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(address()).toBe("/dashboard");
    expect(sessionApi.pingSession).toHaveBeenCalled();
  });

  it("stays logged in at the end of the countdown when another tab kept the session going", async () => {
    vi.useFakeTimers({ now: START });
    loggedIn();
    renderAt("/dashboard");
    await flush();
    vi.mocked(sessionApi.pingSession).mockResolvedValue({
      expiresIn: 30 * 60,
      limitReached: false,
    });

    await flush(60 * MINUTE);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(address()).toBe("/dashboard");
    expect(sessionApi.logOut).not.toHaveBeenCalled();
  });

  it("doesn't warn or redirect on pages that don't need a login", async () => {
    vi.useFakeTimers({ now: START });
    loggedIn();
    renderAt("/terms");
    await flush();
    vi.mocked(sessionApi.pingSession).mockRejectedValue(
      new ApiError(401, "SESSION_EXPIRED", EXPIRED_NOTICE),
    );

    await flush(61 * MINUTE);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(address()).toBe("/terms");
    expect(sessionApi.logOut).toHaveBeenCalled();
  });
});

describe("Other tabs", () => {
  it("logs out here when another tab logs out", async () => {
    loggedIn();
    renderAt("/dashboard");
    await dashboardHeading();
    const otherTab = new BroadcastChannel("topsend-session");

    try {
      otherTab.postMessage({ type: "ended", reason: "loggedOut" });

      expect(await screen.findByText(LOGGED_OUT_NOTICE)).toBeTruthy();
    } finally {
      otherTab.close();
    }
  });

  it("tells the other tabs when it logs in, how long the session has, and when it logs out", async () => {
    const messages: { type: string }[] = [];
    const otherTab = new BroadcastChannel("topsend-session");
    otherTab.onmessage = (event: MessageEvent) => messages.push(event.data);

    try {
      renderAt("/login");
      submitLogin();
      await dashboardHeading();
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
      await screen.findByText(LOGGED_OUT_NOTICE);

      await vi.waitFor(() =>
        expect(messages.map((message) => message.type)).toEqual([
          "extended",
          "started",
          "ended",
        ]),
      );
      expect(messages[2]).toEqual({ type: "ended", reason: "loggedOut" });
    } finally {
      otherTab.close();
    }
  });
});
