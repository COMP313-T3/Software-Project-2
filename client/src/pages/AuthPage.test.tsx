import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App.tsx";
import LoginForm from "../components/auth/LoginForm.tsx";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function input(label: string) {
  return within(screen.getByRole("tabpanel")).getByLabelText(
    label,
  ) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
});

describe("Log in and create account page", () => {
  it("shows the log in view at /login", () => {
    renderAt("/login");

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Log in" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(input("Email").type).toBe("email");
    expect(input("Password").type).toBe("password");
    expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
  });

  it("shows the create account view at /register", () => {
    renderAt("/register");

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Create your climber account",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Create account" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(input("First name")).toBeTruthy();
    expect(input("Last name")).toBeTruthy();
    expect(input("Email").type).toBe("email");
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("keeps every view in the card and hides the others from screen readers", () => {
    renderAt("/login");

    const panels = document.querySelectorAll("[role='tabpanel']");
    expect(panels).toHaveLength(4);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel").id).toBe("loginForm");
  });

  it("switches views with the tabs and keeps what was typed", () => {
    renderAt("/login");
    fireEvent.change(input("Email"), { target: { value: "gab@topsend.ca" } });

    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Create your climber account",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Log in" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeTruthy();
    expect(input("Email").value).toBe("gab@topsend.ca");
  });

  it("puts both tabs in the keyboard order", () => {
    renderAt("/login");

    for (const name of ["Log in", "Create account"]) {
      const tab = screen.getByRole("tab", { name }) as HTMLButtonElement;
      expect(tab.tabIndex).toBe(0);
      expect(tab.disabled).toBe(false);
    }
  });

  it("locks both tabs on the forgot password and reset password views", () => {
    for (const path of ["/forgot-password", "/reset-password"]) {
      renderAt(path);

      for (const name of ["Log in", "Create account"]) {
        const tab = screen.getByRole("tab", { name }) as HTMLButtonElement;
        expect(tab.disabled).toBe(true);
      }
      expect(screen.getByRole("link", { name: "Back to log in" })).toBeTruthy();
      cleanup();
    }
  });

  it("moves between the tabs with the arrow keys", () => {
    renderAt("/login");
    const loginTab = screen.getByRole("tab", { name: "Log in" });
    act(() => loginTab.focus());

    fireEvent.keyDown(loginTab, { key: "ArrowRight" });

    const registerTab = screen.getByRole("tab", { name: "Create account" });
    expect(registerTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(registerTab);
  });

  it("asks for both fields and focuses the email when logging in with nothing typed", () => {
    renderAt("/login");

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(input("Email").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input("Email"));
  });

  it("clears a field's message once it is edited", () => {
    renderAt("/login");
    fireEvent.change(input("Email"), { target: { value: "climber@" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(
      screen.getByText("Enter an email address like name@example.com."),
    ).toBeTruthy();

    fireEvent.change(input("Email"), {
      target: { value: "climber@topsend.ca" },
    });

    expect(
      screen.queryByText("Enter an email address like name@example.com."),
    ).toBeNull();
  });

  it("shows and hides the password", () => {
    renderAt("/login");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input("Password").type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input("Password").type).toBe("password");
  });

  it("hides the status line while a field shows an error", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginForm status="Account created. Log in with your new password." />
      </MemoryRouter>,
    );
    const status = () => document.getElementById("loginStatus")?.textContent;
    expect(status()).toBe("Account created. Log in with your new password.");

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(status()).toBe("");

    fireEvent.change(input("Password"), { target: { value: "anything" } });
    fireEvent.change(input("Email"), {
      target: { value: "jordan@example.com" },
    });
    expect(status()).toBe("Account created. Log in with your new password.");
  });

  it("shows the eyes closed note while the password has focus", () => {
    renderAt("/login");
    const note = screen.getByText("Eyes closed. No peeking.");
    expect(note.getAttribute("data-visible")).toBe("false");

    act(() => input("Password").focus());

    expect(note.getAttribute("data-visible")).toBe("true");
  });

  it("hides the mascot scene from screen readers", () => {
    const { container } = renderAt("/login");

    const scene = container.querySelector("img[alt='']");
    expect(scene?.closest("[aria-hidden='true']")).toBeTruthy();
    expect(screen.getByRole("img", { name: "TopSend" })).toBeTruthy();
  });
});
