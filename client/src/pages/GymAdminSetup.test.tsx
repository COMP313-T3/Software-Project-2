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
  checkSetupLink,
  completeGymAdminSetup,
} from "../lib/gymAdminSetupApi.ts";

vi.mock("../lib/gymAdminSetupApi.ts", () => ({
  checkSetupLink: vi.fn(),
  completeGymAdminSetup: vi.fn(),
}));

const NEW_PASSWORD = "Crimp hard 2 the top";
const READY_MESSAGE =
  "Your Gym Administrator account is ready. Log in with your email and new password.";
const LINK_INVALID = new ApiError(
  400,
  "SETUP_LINK_INVALID",
  "This setup link has expired or was already used. Contact TopSend to get a new one.",
);
const APPLICANT = {
  firstName: "Avery",
  lastName: "Chen",
  email: "avery@example.com",
  gym: { name: "Boulderhaus Leslieville", location: "1 Leslie St, Toronto" },
};

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

async function openReadyLink() {
  renderAt("/gym-admin/setup?token=token-from-email");
  await screen.findByText("avery@example.com");
}

function setUp() {
  fireEvent.click(screen.getByRole("button", { name: "Set up account" }));
}

beforeEach(() => {
  vi.mocked(checkSetupLink).mockResolvedValue(APPLICANT);
  vi.mocked(completeGymAdminSetup).mockResolvedValue({
    status: "ACCOUNT_CREATED",
    message: READY_MESSAGE,
    user: {
      email: "avery@example.com",
      firstName: "Avery",
      lastName: "Chen",
      role: "GYM_ADMIN",
    },
    gym: { name: "Boulderhaus Leslieville", location: "1 Leslie St, Toronto" },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Gym Administrator account setup", () => {
  it("has its own page instead of Page not found", async () => {
    renderAt("/gym-admin/setup?token=token-from-email");

    expect(await heading("Set up your account")).toBeTruthy();
    expect(screen.queryByText(/page not found/i)).toBeNull();
  });

  it("checks the link, takes the token out of the address, and shows whose account it sets up", async () => {
    await openReadyLink();

    expect(checkSetupLink).toHaveBeenCalledWith(
      "token-from-email",
      expect.any(AbortSignal),
    );
    expect(address()).toBe("/gym-admin/setup");
    expect(screen.getByText(/Welcome, Avery\./)).toBeTruthy();
    expect(screen.getByText("Boulderhaus Leslieville")).toBeTruthy();
    expect(document.activeElement).toBe(field(/^Password$/));
    expect(field("Confirm password").type).toBe("password");
    expect(document.title).toBe("Set up your account | TopSend");
  });

  it("keeps the email for password managers without letting it be changed", async () => {
    await openReadyLink();

    const username = document.querySelector<HTMLInputElement>(
      'input[name="username"]',
    );
    expect(username?.value).toBe("avery@example.com");
    expect(username?.readOnly).toBe(true);
  });

  it("leaves out the gym when the link doesn't name one", async () => {
    vi.mocked(checkSetupLink).mockResolvedValue({ ...APPLICANT, gym: null });
    await openReadyLink();

    expect(screen.queryByText(/Gym Administrator of/)).toBeNull();
  });

  it("locks the Log in and Create account switch", async () => {
    await openReadyLink();

    expect(
      (screen.getByRole("tab", { name: "Log in" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("tab", { name: "Create account" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("sets up the account, then opens log in with the email filled in", async () => {
    await openReadyLink();
    type(/^Password$/, NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    setUp();

    await heading("Welcome back");
    expect(completeGymAdminSetup).toHaveBeenCalledTimes(1);
    expect(completeGymAdminSetup).toHaveBeenCalledWith(
      "token-from-email",
      NEW_PASSWORD,
    );
    expect(address()).toBe("/login");
    expect(field("Email").value).toBe("avery@example.com");
    expect(screen.getByText(READY_MESSAGE)).toBeTruthy();
  });

  it("sends one setup while it's saving", async () => {
    vi.mocked(completeGymAdminSetup).mockReturnValue(new Promise(() => {}));
    await openReadyLink();
    type(/^Password$/, NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    setUp();
    expect(await screen.findByText("Setting up your account...")).toBeTruthy();
    setUp();

    expect(completeGymAdminSetup).toHaveBeenCalledTimes(1);
  });

  it("checks the password with the sign-up rules and the confirmation", async () => {
    await openReadyLink();
    type(/^Password$/, "alllowercase1");
    type("Confirm password", "something else");

    setUp();

    expect(screen.getByText("Add an uppercase letter.")).toBeTruthy();
    expect(screen.getByText("Passwords don't match.")).toBeTruthy();
    expect(completeGymAdminSetup).not.toHaveBeenCalled();
  });

  it("shows the API's password message under the field", async () => {
    vi.mocked(completeGymAdminSetup).mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
        password: "Add a number or a symbol.",
      }),
    );
    await openReadyLink();
    type(/^Password$/, NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    setUp();

    expect(await screen.findByText("Add a number or a symbol.")).toBeTruthy();
    expect(field(/^Password$/).getAttribute("aria-invalid")).toBe("true");
  });

  it("says when the email already has an account", async () => {
    const message =
      "This email already has a TopSend account. Contact TopSend so an Administrator can help.";
    vi.mocked(completeGymAdminSetup).mockRejectedValue(
      new ApiError(409, "EMAIL_TAKEN", message, { email: message }),
    );
    await openReadyLink();
    type(/^Password$/, NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    setUp();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(message);
  });

  it("says the link doesn't work when it expired or was used", async () => {
    vi.mocked(checkSetupLink).mockRejectedValue(LINK_INVALID);
    renderAt("/gym-admin/setup?token=used-token");

    const title = await heading("This link doesn't work anymore");
    expect(document.activeElement).toBe(title);
    expect(screen.getByText(/Contact TopSend to get a new one/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says the link doesn't work when it stops working before the account is set up", async () => {
    vi.mocked(completeGymAdminSetup).mockRejectedValue(LINK_INVALID);
    await openReadyLink();
    type(/^Password$/, NEW_PASSWORD);
    type("Confirm password", NEW_PASSWORD);

    setUp();

    await heading("This link doesn't work anymore");
  });

  it("says the link doesn't work when it has no token, without asking the API", async () => {
    renderAt("/gym-admin/setup");

    await heading("This link doesn't work anymore");
    expect(checkSetupLink).not.toHaveBeenCalled();
  });

  it("treats a garbled link as one that doesn't work", async () => {
    vi.mocked(checkSetupLink).mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
        token: "Open the setup link from your email again.",
      }),
    );
    renderAt(`/gym-admin/setup?token=${"x".repeat(200)}`);

    await heading("This link doesn't work anymore");
  });

  it("lets the user check the link again when the API can't be reached", async () => {
    vi.mocked(checkSetupLink).mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."),
    );
    renderAt("/gym-admin/setup?token=token-from-email");
    expect(await screen.findByText(/We couldn't check your link/)).toBeTruthy();
    vi.mocked(checkSetupLink).mockResolvedValue(APPLICANT);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("avery@example.com")).toBeTruthy();
  });

  it("shows the API's message when the link was checked too many times", async () => {
    vi.mocked(checkSetupLink).mockRejectedValue(
      new ApiError(
        429,
        "TOO_MANY_REQUESTS",
        "Too many tries. Please try again later.",
      ),
    );
    renderAt("/gym-admin/setup?token=token-from-email");

    expect(
      await screen.findByText("Too many tries. Please try again later."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("goes back to log in", async () => {
    await openReadyLink();

    fireEvent.click(screen.getByRole("link", { name: "Back to log in" }));

    await heading("Welcome back");
    expect(address()).toBe("/login");
  });
});
