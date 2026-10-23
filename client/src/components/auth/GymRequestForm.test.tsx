import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App.tsx";
import { ApiError } from "../../lib/apiClient.ts";
import { findRequestGyms, submitGymRequest, type GymRequestConfirmation } from "../../lib/gymRequestApi.ts";
import GymRequestForm from "./GymRequestForm.tsx";

vi.mock("../../lib/gymRequestApi.ts", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/gymRequestApi.ts")>()), findRequestGyms: vi.fn(), submitGymRequest: vi.fn() }));
vi.mock("./ReCaptchaBox.tsx", () => ({ default: ({ onTokenChange }: { onTokenChange: (token: string) => void }) => <button type="button" onClick={() => onTokenChange("test-captcha")}>Complete test robot check</button> }));

const gym = { _id: "507f1f77bcf86cd799439011", name: "Northside Climbing", location: "Toronto" };
const rockGym = { _id: "507f1f77bcf86cd799439022", name: "Rock Oasis", location: "388 Carlaw Ave, Toronto" };
const confirmation: GymRequestConfirmation = { requestId: "request-1", requestType: "NEW_GYM", status: "PENDING", gym: { name: "New Boulder", location: "42 Climb Street" }, contact: { email: "alex@example.com" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findRequestGyms).mockResolvedValue({ gyms: [gym] });
  vi.mocked(submitGymRequest).mockResolvedValue(confirmation);
});
afterEach(cleanup);

function open() { render(<MemoryRouter><GymRequestForm introClassName="intro" /></MemoryRouter>); }
function input(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function next() { fireEvent.click(screen.getByRole("button", { name: "Next" })); }
function send() { fireEvent.click(screen.getByRole("button", { name: /^Send/ })); }
function step() { return screen.getByText(/^Step \d of 5$/).textContent; }
function gymOptions() { return Array.from((screen.getByLabelText("Your gym") as HTMLSelectElement).options, (option) => option.textContent); }
function fillContact() {
  next();
  input("First name", "Alex"); input("Last name", "River"); input("Email", "Alex@example.com"); next();
  input("Phone number", "+1 416 555 0100"); next();
}
function fillNewGym() {
  fillContact();
  input("Gym name", "New Boulder"); input("Gym address", "42 Climb Street"); next();
  fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" }));
}

describe("US-034 Request Gym Admin access, in the Log in card", () => {
  it("offers both kinds of request without asking for an account or a password", () => {
    open();
    expect(screen.getByRole("radio", { name: /Register a new gym/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Manage a gym on TopSend/ })).toBeTruthy();
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Back to log in" }).getAttribute("href")).toBe("/login");
  });

  it("checks each step before the next, and focuses the first field to fix", () => {
    open(); next(); next();
    expect(step()).toBe("Step 2 of 5");
    expect(screen.getByText("Enter your first name.").id).toBe("requestFirstNameError");
    expect(screen.getByText("Enter your last name.")).toBeTruthy();
    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("First name"));
    expect(screen.getByLabelText("First name").getAttribute("aria-invalid")).toBe("true");
    expect(submitGymRequest).not.toHaveBeenCalled();
  });

  it("keeps focus on a field being corrected while other messages remain", () => {
    open(); next(); next();
    const firstName = screen.getByLabelText("First name");
    firstName.focus();
    fireEvent.change(firstName, { target: { value: "A" } });
    expect(document.activeElement).toBe(firstName);
    expect(screen.queryByText("Enter your first name.")).toBeNull();
    expect(screen.getByText("Enter your last name.")).toBeTruthy();
  });

  it("sends trimmed new gym details and shows only a pending confirmation", async () => {
    open(); next();
    input("First name", " Alex "); input("Last name", "River"); input("Email", " Alex@example.com "); next();
    input("Phone number", "+1 416 555 0100"); input("Job title (optional)", " Owner "); input("Additional information (optional)", " Monthly comps. "); next();
    input("Gym name", " New Boulder "); input("Gym address", "42 Climb Street"); next();
    fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" }));
    send();
    const title = await screen.findByRole("heading", { name: "Request sent" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(submitGymRequest).toHaveBeenCalledWith({
      requestType: "NEW_GYM", gymName: "New Boulder", gymLocation: "42 Climb Street", firstName: "Alex", lastName: "River",
      email: "alex@example.com", phone: "+1 416 555 0100", jobTitle: "Owner", details: "Monthly comps.", recaptchaToken: "test-captcha", website: "",
    });
    expect(screen.getByText(/You don't have Gym Administrator access yet/)).toBeTruthy();
    expect(screen.getByText(/we'll email you a link to set up your Gym Administrator account/)).toBeTruthy();
    expect(Array.from(document.querySelectorAll("dd"), (item) => item.textContent)).toEqual(["New Boulder", "Register a new gym", "alex@example.com"]);
    expect(screen.getByRole("link", { name: "Back to log in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
  });

  it("starts the Send step on the privacy notice, before the robot check", () => {
    open(); fillContact(); input("Gym name", "New Boulder"); input("Gym address", "42 Climb Street"); next();
    expect(step()).toBe("Step 5 of 5");
    expect(document.activeElement?.textContent).toMatch(/^We use your contact details to review this request/);
    expect(document.activeElement?.querySelector("a")?.textContent).toBe("Privacy Policy");
  });

  it("asks for the robot check, and clears the message once it's done", () => {
    open(); fillContact(); input("Gym name", "New Boulder"); input("Gym address", "42 Climb Street"); next();
    send();
    expect(screen.getByText("Complete the robot check before submitting.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" }));
    expect(screen.queryByText("Complete the robot check before submitting.")).toBeNull();
    expect(submitGymRequest).not.toHaveBeenCalled();
  });

  it("lists the registered gyms for an existing gym, keeps the contact details, and sends only the gym's ID", async () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Manage a gym on TopSend/ }));
    fillContact();
    expect(step()).toBe("Step 4 of 5");
    expect(document.activeElement).toBe(screen.getByLabelText("Search by gym name or address"));
    expect(screen.queryByLabelText("Gym name")).toBeNull();
    await screen.findByRole("option", { name: "Northside Climbing, Toronto" });
    fireEvent.change(screen.getByLabelText("Your gym"), { target: { value: gym._id } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alex");
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" }));
    vi.mocked(submitGymRequest).mockResolvedValue({ ...confirmation, requestType: "EXISTING_GYM", gym });
    send();
    await screen.findByRole("heading", { name: "Request sent" });
    const sent = vi.mocked(submitGymRequest).mock.calls[0][0];
    expect(sent).toHaveProperty("gymId", gym._id);
    expect(sent).not.toHaveProperty("gymName");
    expect(screen.getByText("Manage a gym on TopSend")).toBeTruthy();
  });

  it("doesn't take typed search text as the chosen gym", async () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Manage a gym on TopSend/ }));
    fillContact();
    await screen.findByRole("option", { name: "Northside Climbing, Toronto" });
    input("Search by gym name or address", "Northside"); next();
    expect(screen.getByText("Choose your gym from the results.").id).toBe("requestGymError");
    expect(document.activeElement).toBe(screen.getByLabelText("Your gym"));
    expect(step()).toBe("Step 4 of 5");
  });

  it("says how each gym search went, keeps the chosen gym, and drops what a failed search had found", async () => {
    vi.mocked(findRequestGyms).mockRejectedValueOnce(new Error("offline"));
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Manage a gym on TopSend/ }));
    fillContact();
    const status = await screen.findByText("Couldn't load the gyms. Try searching again.");
    expect(status.getAttribute("role")).toBe("status");
    expect(screen.getByLabelText("Search by gym name or address").getAttribute("aria-describedby")).toBe(status.id);
    expect(screen.getByLabelText("Your gym").getAttribute("aria-describedby")).toBe(`${status.id} requestGymError`);
    expect(gymOptions()).toEqual(["Couldn't load the gyms"]);

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(status.textContent).toBe("1 gym found."));
    fireEvent.change(screen.getByLabelText("Your gym"), { target: { value: gym._id } });

    vi.mocked(findRequestGyms).mockResolvedValueOnce({ gyms: [] });
    input("Search by gym name or address", "Nowhere");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(status.textContent).toBe("No gyms match your search. Try another name or street."));
    expect((screen.getByLabelText("Your gym") as HTMLSelectElement).value).toBe(gym._id);

    vi.mocked(findRequestGyms).mockResolvedValueOnce({ gyms: [rockGym] });
    input("Search by gym name or address", "Rock");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(status.textContent).toBe("1 gym found."));
    expect(gymOptions()).toEqual(["Choose your gym", "Northside Climbing, Toronto", "Rock Oasis, 388 Carlaw Ave, Toronto"]);

    vi.mocked(findRequestGyms).mockRejectedValueOnce(new Error("offline"));
    input("Search by gym name or address", "Rocky");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(status.textContent).toBe("Couldn't load the gyms. Try searching again."));
    expect(gymOptions()).toEqual(["Couldn't load the gyms", "Northside Climbing, Toronto"]);
    expect((screen.getByLabelText("Your gym") as HTMLSelectElement).value).toBe(gym._id);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alex");
  });

  it("says when there are no gyms on TopSend yet", async () => {
    vi.mocked(findRequestGyms).mockResolvedValue({ gyms: [] });
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Manage a gym on TopSend/ }));
    fillContact();
    expect(await screen.findByText("No gyms are on TopSend yet.")).toBeTruthy();
    expect(gymOptions()).toEqual(["No gyms found"]);
  });

  it("searches with Enter without sending the request", async () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Manage a gym on TopSend/ }));
    fillContact();
    await screen.findByRole("option", { name: "Northside Climbing, Toronto" });
    input("Search by gym name or address", " Toronto ");
    fireEvent.keyDown(screen.getByLabelText("Search by gym name or address"), { key: "Enter" });
    await waitFor(() => expect(findRequestGyms).toHaveBeenLastCalledWith("Toronto", expect.any(AbortSignal)));
    expect(step()).toBe("Step 4 of 5");
    expect(submitGymRequest).not.toHaveBeenCalled();
  });

  it("sends once while waiting, and says it's sending", async () => {
    let finish!: (value: GymRequestConfirmation) => void;
    vi.mocked(submitGymRequest).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    open(); fillNewGym(); send();
    const button = screen.getByRole("button", { name: "Sending..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Sending your request...");
    fireEvent.click(button);
    expect(submitGymRequest).toHaveBeenCalledTimes(1);
    await act(async () => finish(confirmation));
    expect(await screen.findByRole("heading", { name: "Request sent" })).toBeTruthy();
  });

  it.each([
    ["EMAIL_TAKEN", "This email already has a TopSend account. Use a different email for your Gym Administrator account."],
    ["REQUEST_PENDING", "A request from this email is already waiting for review. We'll email you once it's reviewed."],
    ["REQUEST_APPROVED", "A request from this email was already approved. Use the setup link we emailed you to set up your Gym Administrator account, or contact TopSend for a new link."],
  ])("goes back to the email with the %s answer under it, keeping everything", async (code, message) => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(409, code, message, { email: message }));
    open(); fillNewGym(); send();
    await waitFor(() => expect(step()).toBe("Step 2 of 5"));
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(screen.getByText(message).id).toBe("requestEmailError");
    expect(email.getAttribute("aria-describedby")).toBe("requestEmailError");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(email);
    expect(email.value).toBe("Alex@example.com");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("heading", { name: "Request sent" })).toBeNull();

    input("Email", "alex.river@example.com");
    expect(screen.queryByText(message)).toBeNull();
    expect(email.getAttribute("aria-invalid")).toBeNull();
  });

  it("goes back to the gym name when the gym is already on TopSend, naming the choice to make instead", async () => {
    const message = 'This gym is already on TopSend. Choose "Manage a gym on TopSend" to request access to it instead.';
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(409, "GYM_EXISTS", message, { gymName: message }));
    open(); fillNewGym(); send();
    await waitFor(() => expect(step()).toBe("Step 4 of 5"));
    expect(screen.getByText(message).id).toBe("requestGymNameError");
    expect(document.activeElement).toBe(screen.getByLabelText("Gym name"));
    expect(screen.getByRole("radio", { name: /^Manage a gym on TopSend/, hidden: true })).toBeTruthy();

    next();
    expect(step()).toBe("Step 5 of 5");
    expect(document.getElementById("requestGymNameError")?.textContent).toBe("");
    expect(screen.getByLabelText("Gym name", { selector: "input" }).getAttribute("aria-invalid")).toBeNull();
  });

  it("goes back to the gym list when the chosen gym can no longer take requests", async () => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", { gymId: "Choose your gym from the list." }));
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Manage a gym on TopSend/ }));
    fillContact();
    await screen.findByRole("option", { name: "Northside Climbing, Toronto" });
    fireEvent.change(screen.getByLabelText("Your gym"), { target: { value: gym._id } });
    next();
    fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" }));
    send();
    await waitFor(() => expect(step()).toBe("Step 4 of 5"));
    expect(screen.getByText("Choose your gym from the list.").id).toBe("requestGymError");
    expect(screen.getByLabelText("Your gym").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Your gym"));
  });

  it("goes back to a field the server turned down, with its message", async () => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Check the fields and try again.", { gymLocation: "Use 200 characters or fewer." }));
    open(); fillNewGym(); send();
    await waitFor(() => expect(step()).toBe("Step 4 of 5"));
    expect(screen.getByText("Use 200 characters or fewer.").id).toBe("requestGymAddressError");
    expect(document.activeElement).toBe(screen.getByLabelText("Gym address"));
  });

  it("hides internal server errors, keeps the privacy notice, and puts focus back on Send", async () => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(500, "DATABASE_FAILURE", "private connection secret"));
    open(); fillNewGym(); send();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("We couldn't submit your request. Please try again later."));
    expect(screen.queryByText(/private connection/)).toBeNull();
    expect(screen.getByText(/^We use your contact details to review this request/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send request" }));
    send();
    expect(await screen.findByText("Complete the robot check before submitting.")).toBeTruthy();
    expect(submitGymRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says when there have been too many requests, without leaving the Send step", async () => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(429, "TOO_MANY_REQUESTS", "Too many requests."));
    open(); fillNewGym(); send();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Too many requests. Please wait before trying again."));
    expect(step()).toBe("Step 5 of 5");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send request" }));
  });

  it("asks for the robot check again when Google turns it down, with focus back on Send", async () => {
    const message = "The reCAPTCHA check didn't go through. Check the box again.";
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(400, "RECAPTCHA_FAILED", message, { recaptchaToken: message }));
    open(); fillNewGym(); send();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(step()).toBe("Step 5 of 5");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send request" })));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});

function Address() {
  const { pathname } = useLocation();
  return <output aria-label="Current address">{pathname}</output>;
}

describe("US-034 Request Gym Admin access from the Log in page", () => {
  function renderAt(path: string) {
    render(<MemoryRouter initialEntries={[path]}><Address /><App /></MemoryRouter>);
  }

  it("opens from the button under Log in, in the same card without the tabs, and goes back", async () => {
    renderAt("/login");
    expect(screen.getByText("Run a climbing gym?")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Request Gym Admin access" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Request Gym Admin access" })).toBeTruthy();
    expect(screen.getByLabelText("Current address").textContent).toBe("/gym-request");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(document.querySelector("[role='tablist']")?.getAttribute("data-hidden")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Register a new gym/ })));
    expect(document.title).toBe("Request Gym Admin access | TopSend");

    fireEvent.click(screen.getByRole("link", { name: "Back to log in" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Request Gym Admin access" })).toBeNull();
  });

  it("opens straight from its address, with the gym address apart from the sign-up address", () => {
    renderAt("/gym-request");
    const card = screen.getByRole("region", { name: "Request Gym Admin access" });
    fireEvent.click(within(card).getByRole("button", { name: "Next" }));
    expect(within(card).getByText("Step 2 of 5")).toBeTruthy();
    expect(document.querySelectorAll("#address")).toHaveLength(1);
  });

  it.each(["/gym-request/", "/Gym-Request"])("opens from %s too, as its route does", (path) => {
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1, name: "Request Gym Admin access" })).toBeTruthy();
    expect(document.title).toBe("Request Gym Admin access | TopSend");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("isn't in the card while Log in shows, and the tagline has no other way in", () => {
    renderAt("/login");
    expect(document.getElementById("gymRequestForm")).toBeNull();
    expect(screen.getByText("Local bouldering competitions in Toronto.").querySelector("a")).toBeNull();
  });
});
