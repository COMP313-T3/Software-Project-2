import {
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
import {
  checkResetLink,
  requestPasswordReset,
  resetPassword,
} from "../lib/authApi.ts";

vi.mock("../lib/authApi.ts", () => ({
  requestPasswordReset: vi.fn(),
  checkResetLink: vi.fn(),
  resetPassword: vi.fn(),
}));

const NEW_PASSWORD = "Crimp hard 2 the top";
const LINK_INVALID = new ApiError(
  400,
  "RESET_LINK_INVALID",
  "This reset link has expired or was already used. Ask for a new one.",
);

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

function panel() {
  return within(screen.getByRole("tabpanel"));
}

function field(label: string | RegExp) {
  return panel().getByLabelText(label) as HTMLInputElement;
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function heading(name: string) {
  return screen.findByRole("heading", { level: 1, name });
}

beforeEach(() => {
  vi.mocked(requestPasswordReset).mockResolvedValue(undefined);
  vi.mocked(checkResetLink).mockResolvedValue({ email: "jordan@example.com" });
  vi.mocked(resetPassword).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Forgot password", () => {
  it("opens from the log in form with the email typed there", async () => {
    renderAt("/login");
    type("Email", "jordan@example.com");

    fireEvent.click(screen.getByRole("link", { name: "Forgot password?" }));

    await heading("Forgot your password?");
    expect(address()).toBe("/forgot-password");
    expect(field("Email").value).toBe("jordan@example.com");
    expect(document.activeElement).toBe(field("Email"));
    expect(
      screen.getByRole("tab", { name: "Log in" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("sends the link and says to check the email, the same way for any email", async () => {
    renderAt("/forgot-password");
    type("Email", "  jordan@example.com ");

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    const title = await heading("Check your email");
    expect(requestPasswordReset).toHaveBeenCalledWith("jordan@example.com");
    expect(
      screen.getByText(/we sent it a link to choose a new password/),
    ).toBeTruthy();
    expect(screen.getByText("jordan@example.com")).toBeTruthy();
    expect(screen.getByText(/The link works for 1 hour/)).toBeTruthy();
    expect(document.activeElement).toBe(title);
  });

  it("goes back to the form, keeping the email, to try again", async () => {
    renderAt("/forgot-password");
    type("Email", "jordan@exmaple.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await heading("Check your email");

    fireEvent.click(screen.getByRole("button", { name: "try again" }));

    await heading("Forgot your password?");
    expect(field("Email").value).toBe("jordan@exmaple.com");
    expect(document.activeElement).toBe(field("Email"));
  });

  it("checks the email before sending", () => {
    renderAt("/forgot-password");
    type("Email", "jordan@");

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      screen.getByText("Enter an email address like name@example.com."),
    ).toBeTruthy();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("shows the API's message when too many links were asked for", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(
      new ApiError(
        429,
        "TOO_MANY_REQUESTS",
        "Too many reset requests for this email. Please try again later.",
      ),
    );
    renderAt("/forgot-password");
    type("Email", "jordan@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "Too many reset requests for this email. Please try again later.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Forgot your password?",
    );
  });

  it("goes back to log in", async () => {
    renderAt("/forgot-password");

    fireEvent.click(screen.getByRole("link", { name: "Back to log in" }));

    await heading("Welcome back");
    expect(address()).toBe("/login");
    expect(document.activeElement).toBe(field("Email"));
  });
});

describe("Reset password", () => {
  it("checks the link, takes the token out of the address, and asks for the new password", async () => {
    renderAt("/reset-password?token=token-from-email");

    expect(await screen.findByText("jordan@example.com")).toBeTruthy();
    expect(checkResetLink).toHaveBeenCalledWith(
      "token-from-email",
      expect.any(AbortSignal),
    );
    expect(address()).toBe("/reset-password");
    expect(
      screen.getByRole("heading", { level: 1, name: "Choose a new password" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(field("New password"));
    expect(field("Confirm password").type).toBe("password");
  });

  it("saves the new password, then opens log in with the email filled in", async () => {
    renderAt("/reset-password?token=token-from-email");
    await screen.findByText("jordan@example.com");
    type("New password", NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await heading("Welcome back");
    expect(resetPassword).toHaveBeenCalledWith(
      "token-from-email",
      NEW_PASSWORD,
    );
    expect(address()).toBe("/login");
    expect(field("Email").value).toBe("jordan@example.com");
    expect(
      screen.getByText("Password changed. Log in with your new password."),
    ).toBeTruthy();
  });

  it("checks the new password with the sign-up rules and the confirmation", async () => {
    renderAt("/reset-password?token=token-from-email");
    await screen.findByText("jordan@example.com");
    type("New password", "alllowercase1");
    type("Confirm password", "something else");

    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(screen.getByText("Add an uppercase letter.")).toBeTruthy();
    expect(screen.getByText("Passwords don't match.")).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("offers a new link when the link expired or was used", async () => {
    vi.mocked(checkResetLink).mockRejectedValue(LINK_INVALID);
    renderAt("/reset-password?token=used-token");

    const title = await heading("This link doesn't work anymore");
    expect(document.activeElement).toBe(title);

    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));

    await heading("Forgot your password?");
    expect(address()).toBe("/forgot-password");
  });

  it("offers a new link when the link stops working before the password is saved", async () => {
    vi.mocked(resetPassword).mockRejectedValue(LINK_INVALID);
    renderAt("/reset-password?token=token-from-email");
    await screen.findByText("jordan@example.com");
    type("New password", NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await heading("This link doesn't work anymore");
  });

  it("says the link doesn't work when it has no token, without asking the API", async () => {
    renderAt("/reset-password");

    await heading("This link doesn't work anymore");
    expect(checkResetLink).not.toHaveBeenCalled();
  });

  it("lets the user check the link again when the API can't be reached", async () => {
    vi.mocked(checkResetLink).mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."),
    );
    renderAt("/reset-password?token=token-from-email");
    expect(await screen.findByText(/We couldn't check your link/)).toBeTruthy();
    vi.mocked(checkResetLink).mockResolvedValue({
      email: "jordan@example.com",
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("jordan@example.com")).toBeTruthy();
  });

  it("shows the API's message when the link was checked too many times", async () => {
    vi.mocked(checkResetLink).mockRejectedValue(
      new ApiError(
        429,
        "TOO_MANY_REQUESTS",
        "Too many tries. Please try again later.",
      ),
    );
    renderAt("/reset-password?token=token-from-email");

    expect(
      await screen.findByText("Too many tries. Please try again later."),
    ).toBeTruthy();
  });

  it("treats a garbled link as one that doesn't work", async () => {
    vi.mocked(checkResetLink).mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
        token: "Open the link from your email again.",
      }),
    );
    renderAt(`/reset-password?token=${"x".repeat(200)}`);

    await heading("This link doesn't work anymore");
  });
});
