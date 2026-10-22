import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/apiClient.ts";
import { findRequestGyms, submitGymRequest, type GymRequestConfirmation } from "../lib/gymRequestApi.ts";
import GymRequestPage from "./GymRequestPage.tsx";

vi.mock("../lib/gymRequestApi.ts", async importOriginal => ({ ...await importOriginal<typeof import("../lib/gymRequestApi.ts")>(), findRequestGyms: vi.fn(), submitGymRequest: vi.fn() }));
vi.mock("../components/auth/ReCaptchaBox.tsx", () => ({ default: ({ onTokenChange }: { onTokenChange: (token: string) => void }) => <button type="button" onClick={() => onTokenChange("test-captcha")}>Complete test robot check</button> }));
const gym = { _id: "507f1f77bcf86cd799439011", name: "Northside Climbing", location: "Toronto" };
const confirmation: GymRequestConfirmation = { requestId: "request-1", requestType: "NEW_GYM", status: "PENDING", gym: { name: "New Boulder", location: "42 Climb Street" }, contact: { email: "alex@example.com" } };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(findRequestGyms).mockResolvedValue({ gyms: [gym] }); vi.mocked(submitGymRequest).mockResolvedValue(confirmation); });
afterEach(cleanup);
function open() { render(<MemoryRouter><GymRequestPage /></MemoryRouter>); }
function input(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function fillContact() {
  input("First name", "Alex"); input("Last name", "River"); input("Email", "Alex@example.com"); input("Phone number", "+1 416 555 0100");
}
function fillNew() { fillContact(); input("Gym name", "New Boulder"); input("Gym address", "42 Climb Street"); fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" })); }
function submit() { fireEvent.click(screen.getByRole("button", { name: "Submit request for review" })); }

describe("US034 Visitor gym request and confirmation", () => {
  it("provides both request types without asking for an account or password", () => {
    open(); expect(screen.getByRole("radio", { name: /New gym/ })).toBeTruthy(); expect(screen.getByRole("radio", { name: /Existing gym/ })).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull(); expect(screen.getByRole("link", { name: "Back to log in" }).getAttribute("href")).toBe("/login");
  });
  it("validates required fields, focuses the error summary and sends no request", async () => {
    open(); submit(); const error = await screen.findByRole("alert"); expect(document.activeElement).toBe(error);
    expect(screen.getByText("Complete the robot check before submitting.", { selector: "p" })).toBeTruthy(); expect(submitGymRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: /First name: Enter/ })); expect(document.activeElement).toBe(screen.getByLabelText("First name"));
  });
  it("submits trimmed new-gym data and displays only pending review confirmation", async () => {
    open(); fillNew(); input("Gym name", " New Boulder "); submit();
    const title = await screen.findByRole("heading", { name: "Your request has been submitted" });
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(submitGymRequest).toHaveBeenCalledWith(expect.objectContaining({ requestType: "NEW_GYM", gymName: "New Boulder", gymLocation: "42 Climb Street", email: "alex@example.com", recaptchaToken: "test-captcha", website: "" }));
    expect(screen.getByText("Pending review")).toBeTruthy(); expect(screen.getByText(/access has not been granted yet/)).toBeTruthy();
    expect(screen.getByText(/If approved, you'll receive instructions/)).toBeTruthy(); expect(screen.getByRole("link", { name: "Return to home" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("form")).toBeNull();
  });
  it("does not steal keyboard focus while correcting one field with other errors remaining", async () => {
    open(); submit(); await screen.findByRole("alert");
    const firstName = screen.getByLabelText("First name"); firstName.focus();
    fireEvent.change(firstName, { target: { value: "A" } });
    expect(document.activeElement).toBe(firstName);
    expect(screen.getByText("Enter your last name.", { selector: "p" })).toBeTruthy();
    fireEvent.change(firstName, { target: { value: "Alex" } });
    expect(document.activeElement).toBe(firstName);
  });
  it("clears a stale captcha error immediately after completing the robot check", async () => {
    open(); submit(); await screen.findByText("Complete the robot check before submitting.", { selector: "p" });
    fireEvent.click(screen.getByRole("button", { name: "Complete test robot check" }));
    expect(screen.queryByText("Complete the robot check before submitting.", { selector: "p" })).toBeNull();
    expect(screen.getByText("Enter your first name.", { selector: "p" })).toBeTruthy();
  });
  it("loads existing gyms, retains contact details when switching, and sends only the selected gym ID", async () => {
    open(); fillNew(); fireEvent.click(screen.getByRole("radio", { name: /Existing gym/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Northside Climbing, Toronto" }));
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alex"); expect(screen.queryByLabelText("Gym name")).toBeNull();
    vi.mocked(submitGymRequest).mockResolvedValue({ ...confirmation, requestType: "EXISTING_GYM", gym }); submit();
    await screen.findByRole("heading", { name: "Your request has been submitted" });
    const sent = vi.mocked(submitGymRequest).mock.calls[0][0]; expect(sent).toHaveProperty("gymId", gym._id); expect(sent).not.toHaveProperty("gymName");
    expect(screen.getByText("Access an existing gym")).toBeTruthy();
  });
  it("does not accept free-text gym search as a selection", async () => {
    open(); fillNew(); fireEvent.click(screen.getByRole("radio", { name: /Existing gym/ })); await screen.findByRole("button", { name: /Northside/ });
    input("Search by gym name or address", "Northside"); submit();
    expect(await screen.findByText("Choose your gym from the results.", { selector: "p" })).toBeTruthy(); expect(submitGymRequest).not.toHaveBeenCalled();
  });
  it("supports lookup error recovery and empty search results without losing contact input", async () => {
    vi.mocked(findRequestGyms).mockRejectedValueOnce(new Error("offline")); open(); fillContact(); fireEvent.click(screen.getByRole("radio", { name: /Existing gym/ }));
    await screen.findByText(/Couldn't load registered gyms/); vi.mocked(findRequestGyms).mockResolvedValue({ gyms: [] });
    fireEvent.click(screen.getByRole("button", { name: "Try loading gyms again" })); await screen.findByText(/No registered gyms found/);
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Alex");
  });
  it("searches with Enter without submitting the application", async () => {
    open(); fireEvent.click(screen.getByRole("radio", { name: /Existing gym/ })); await screen.findByRole("button", { name: /Northside/ });
    input("Search by gym name or address", " Toronto "); fireEvent.keyDown(screen.getByLabelText("Search by gym name or address"), { key: "Enter" });
    await waitFor(() => expect(findRequestGyms).toHaveBeenLastCalledWith("Toronto", expect.any(AbortSignal))); expect(submitGymRequest).not.toHaveBeenCalled();
  });
  it("keeps one pending submission and disables repeat clicks", async () => {
    let finish!: (value: GymRequestConfirmation) => void;
    vi.mocked(submitGymRequest).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    open(); fillNew(); submit(); const button = screen.getByRole("button", { name: "Submitting request…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button); expect(submitGymRequest).toHaveBeenCalledTimes(1);
    await act(async () => finish(confirmation)); await screen.findByText("Pending review");
  });
  it("retains input and displays duplicate-request feedback rather than success", async () => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(409, "REQUEST_PENDING", "duplicate", { email: "This email has a pending request." }));
    open(); fillNew(); submit(); await screen.findByRole("alert"); expect(screen.getByText(/A request from this email/)).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("Alex@example.com"); expect(screen.queryByText("Pending review")).toBeNull();
  });
  it("gives the same approved-request message in the summary and under the email", async () => {
    const message = "A request from this email was already approved. Use the setup link we emailed you to set up your Gym Administrator account, or contact TopSend for a new link.";
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(409, "REQUEST_APPROVED", message, { email: message }));
    open(); fillNew(); submit(); const summary = await screen.findByRole("alert");
    expect(summary.querySelector("p")?.textContent).toBe(message); expect(document.getElementById("email-error")?.textContent).toBe(message);
  });
  it("hides internal server errors and requires a fresh captcha after failure", async () => {
    vi.mocked(submitGymRequest).mockRejectedValue(new ApiError(500, "DATABASE_FAILURE", "private connection secret"));
    open(); fillNew(); submit(); await screen.findByRole("alert"); expect(screen.queryByText(/private connection/)).toBeNull(); submit();
    await screen.findByText("Complete the robot check before submitting.", { selector: "p" }); expect(submitGymRequest).toHaveBeenCalledTimes(1);
  });
});
