import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import { ApiError } from "../lib/apiClient.ts";
import type { RecaptchaRenderOptions } from "../lib/recaptcha.ts";
import { createClimberAccount } from "../lib/usersApi.ts";

const recaptcha = vi.hoisted(() => ({ reset: vi.fn() }));

vi.mock("../lib/recaptcha.ts", () => ({
  RECAPTCHA_SITE_KEY: "site-key-for-tests",
  loadRecaptcha: () =>
    Promise.resolve({
      render(container: HTMLElement, options: RecaptchaRenderOptions) {
        const box = document.createElement("button");
        box.type = "button";
        box.textContent = "I'm not a robot";
        box.addEventListener("click", () =>
          options.callback?.("token-from-google"),
        );
        container.append(box);
        return 0;
      },
      reset: recaptcha.reset,
    }),
}));

vi.mock("../lib/usersApi.ts", () => ({ createClimberAccount: vi.fn() }));

const PASSWORD = "Chalk up & send it";
const AGREEMENT = /I agree to the Terms and Conditions/;

function panel() {
  return within(screen.getByRole("tabpanel"));
}

function field(label: string | RegExp) {
  return panel().getByLabelText(label) as HTMLInputElement;
}

function stepLabel() {
  return screen.getByText(/^Step \d of 5$/).textContent;
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

function openCreateAccount() {
  render(
    <MemoryRouter initialEntries={["/register"]}>
      <App />
    </MemoryRouter>,
  );
}

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function fillNameAndEmail() {
  type("First name", "Jordan");
  type("Last name", "Sendwell");
  type("Email", "jordan@example.com");
}

function pickBirthday() {
  fireEvent.click(field("Date of birth"));
  fireEvent.change(screen.getByLabelText("Choose the Year"), {
    target: { value: "2000" },
  });
  fireEvent.change(screen.getByLabelText("Choose the Month"), {
    target: { value: "4" },
  });
  fireEvent.click(screen.getByRole("button", { name: /May 17th, 2000/ }));
}

function fillAboutYou() {
  pickBirthday();
  fireEvent.change(field("Gender"), { target: { value: "FEMALE" } });
  type("Phone number", "416 555 0123");
}

function fillLocation() {
  type("Address", "123 Queen St W, Toronto, ON");
  type("Postal code", "M5H 2N2");
}

function fillPasswords(confirmation = PASSWORD) {
  type("Password", PASSWORD);
  type("Confirm password", confirmation);
}

async function reachLastStep() {
  openCreateAccount();
  fillNameAndEmail();
  next();
  fillAboutYou();
  next();
  fillLocation();
  next();
  fillPasswords();
  next();
  await screen.findByRole("button", { name: "I'm not a robot" });
}

async function agreeAndTickTheBox() {
  fireEvent.click(field(AGREEMENT));
  fireEvent.click(
    await screen.findByRole("button", { name: "I'm not a robot" }),
  );
}

function pressCreateAccount() {
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

beforeEach(() => {
  vi.mocked(createClimberAccount).mockReset();
  recaptcha.reset.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("Create account", () => {
  it("moves through five steps with a progress bar and focuses each step's first field", () => {
    openCreateAccount();
    expect(
      screen.getByText("Name and email", { selector: "span" }),
    ).toBeTruthy();
    expect(stepLabel()).toBe("Step 1 of 5");

    fillNameAndEmail();
    next();
    expect(stepLabel()).toBe("Step 2 of 5");
    expect(screen.getByText("About you", { selector: "span" })).toBeTruthy();
    expect(document.activeElement).toBe(field("Date of birth"));

    fillAboutYou();
    next();
    expect(stepLabel()).toBe("Step 3 of 5");
    expect(document.activeElement).toBe(field("Address"));
    expect(field("Country").value).toBe("CA");

    fillLocation();
    next();
    expect(stepLabel()).toBe("Step 4 of 5");
    expect(document.activeElement).toBe(field("Password"));

    fillPasswords();
    next();
    expect(stepLabel()).toBe("Step 5 of 5");
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("checks a step before moving on", () => {
    openCreateAccount();
    next();
    expect(screen.getByText("Enter your first name.")).toBeTruthy();
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(stepLabel()).toBe("Step 1 of 5");
    expect(document.activeElement).toBe(field("First name"));

    fillNameAndEmail();
    next();
    next();
    expect(screen.getByText("Enter your date of birth.")).toBeTruthy();
    expect(screen.getByText("Choose an option.")).toBeTruthy();
    expect(screen.getByText("Enter your phone number.")).toBeTruthy();
    expect(stepLabel()).toBe("Step 2 of 5");
  });

  it("checks the postal code against the country", () => {
    openCreateAccount();
    fillNameAndEmail();
    next();
    fillAboutYou();
    next();
    type("Address", "123 Queen St W, Toronto, ON");
    type("Postal code", "12345");
    next();

    expect(screen.getByText("Use the format A1A 1A1.")).toBeTruthy();

    fireEvent.change(field("Country"), { target: { value: "US" } });
    next();
    expect(stepLabel()).toBe("Step 4 of 5");
  });

  it("keeps what was typed when going back a step", () => {
    openCreateAccount();
    fillNameAndEmail();
    next();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(stepLabel()).toBe("Step 1 of 5");
    expect(field("First name").value).toBe("Jordan");
    expect(field("Email").value).toBe("jordan@example.com");
  });

  it("shows the password rules as they're met and needs all of them", () => {
    openCreateAccount();
    fillNameAndEmail();
    next();
    fillAboutYou();
    next();
    fillLocation();
    next();

    type("Password", "chalk up & send it");
    const rules = within(document.getElementById("registerPasswordRules")!);
    expect(
      rules.getByText("A lowercase letter").closest("li")?.dataset.met,
    ).toBe("true");
    expect(
      rules.getByText("An uppercase letter").closest("li")?.dataset.met,
    ).toBe("false");

    next();
    expect(screen.getByText("Add an uppercase letter.")).toBeTruthy();
    expect(stepLabel()).toBe("Step 4 of 5");
  });

  it("needs the password typed twice the same way", () => {
    openCreateAccount();
    fillNameAndEmail();
    next();
    fillAboutYou();
    next();
    fillLocation();
    next();

    type("Password", PASSWORD);
    next();
    expect(screen.getByText("Re-enter your password.")).toBeTruthy();
    expect(document.activeElement).toBe(field("Confirm password"));

    fillPasswords("Chalk up & send it!");
    next();
    expect(screen.getByText("Passwords don't match.")).toBeTruthy();
    expect(stepLabel()).toBe("Step 4 of 5");

    type("Confirm password", PASSWORD);
    expect(screen.queryByText("Passwords don't match.")).toBeNull();
    next();
    expect(stepLabel()).toBe("Step 5 of 5");
  });

  it("names each show and hide button after its own password field", () => {
    openCreateAccount();
    fillNameAndEmail();
    next();
    fillAboutYou();
    next();
    fillLocation();
    next();

    fireEvent.click(
      screen.getByRole("button", { name: "Show confirm password" }),
    );

    expect(field("Confirm password").type).toBe("text");
    expect(field("Password").type).toBe("password");
  });

  it("asks for the agreement and the reCAPTCHA on the last step", async () => {
    await reachLastStep();

    pressCreateAccount();

    expect(
      screen.getByText("Agree to the Terms and Privacy Policy to continue."),
    ).toBeTruthy();
    expect(
      screen.getByText("Check the box to show you're not a robot."),
    ).toBeTruthy();
    expect(document.activeElement).toBe(field(AGREEMENT));
    expect(createClimberAccount).not.toHaveBeenCalled();
  });

  it("creates the account, says so, and leads to Log in with the email filled in", async () => {
    vi.mocked(createClimberAccount).mockResolvedValue({
      userId: "new-user",
      status: "created",
      role: "CLIMBER",
    });
    await reachLastStep();
    await agreeAndTickTheBox();

    pressCreateAccount();

    const created = await screen.findByRole("heading", {
      level: 1,
      name: "Account successfully created!",
    });
    expect(document.activeElement).toBe(created);
    expect(screen.getByText("jordan@example.com")).toBeTruthy();
    expect(createClimberAccount).toHaveBeenCalledWith({
      firstName: "Jordan",
      lastName: "Sendwell",
      email: "jordan@example.com",
      dateOfBirth: "2000-05-17",
      gender: "FEMALE",
      phone: "416 555 0123",
      address: "123 Queen St W, Toronto, ON",
      country: "CA",
      postalCode: "M5H 2N2",
      password: PASSWORD,
      acceptedTerms: true,
      recaptchaToken: "token-from-google",
      website: "",
    });

    fireEvent.click(screen.getByRole("button", { name: "Log in now" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeTruthy();
    expect(field("Email").value).toBe("jordan@example.com");
    expect(document.activeElement).toBe(field("Password"));

    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    expect(stepLabel()).toBe("Step 1 of 5");
    expect(field("Email").value).toBe("");
  });

  it("goes back to the step of a field the server rejects", async () => {
    const message = "This email already has an account. Try logging in.";
    vi.mocked(createClimberAccount).mockRejectedValue(
      new ApiError(409, "EMAIL_TAKEN", message, { email: message }),
    );
    await reachLastStep();
    await agreeAndTickTheBox();

    pressCreateAccount();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(stepLabel()).toBe("Step 1 of 5");
    expect(field("Email").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Email"));
    expect(recaptcha.reset).toHaveBeenCalled();
  });

  it("shows the server's message when the account can't be created", async () => {
    const message =
      "Couldn't reach the server. Check your connection and try again.";
    vi.mocked(createClimberAccount).mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR", message),
    );
    await reachLastStep();
    await agreeAndTickTheBox();

    pressCreateAccount();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(stepLabel()).toBe("Step 5 of 5");
  });

  it("sends whatever is typed in the hidden website field", async () => {
    vi.mocked(createClimberAccount).mockResolvedValue({
      userId: "new-user",
      status: "created",
      role: "CLIMBER",
    });
    await reachLastStep();
    fireEvent.change(document.getElementById("website") as HTMLInputElement, {
      target: { value: "https://spam.example" },
    });
    await agreeAndTickTheBox();

    pressCreateAccount();

    await screen.findByRole("heading", {
      level: 1,
      name: "Account successfully created!",
    });
    expect(createClimberAccount).toHaveBeenCalledWith(
      expect.objectContaining({ website: "https://spam.example" }),
    );
  });

  it("opens the Terms in a pop-up without leaving the form", async () => {
    await reachLastStep();

    fireEvent.click(screen.getByRole("link", { name: "Terms and Conditions" }));

    const dialog = screen.getByRole("dialog", { name: "Terms and Conditions" });
    expect(within(dialog).getByText(/^Version 1\.0, effective/)).toBeTruthy();
    expect(within(dialog).getByText("Acceptable use")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(stepLabel()).toBe("Step 5 of 5");
  });
});
