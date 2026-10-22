import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";
import type { Role } from "../constants/roles.ts";
import { ApiError } from "../lib/apiClient.ts";
import {
  getGymRequest,
  type GymRequestDetails,
} from "../lib/gymRequestReviewApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/gymRequestReviewApi.ts", () => ({
  listGymRequests: vi.fn(),
  getGymRequest: vi.fn(),
  reviewGymRequest: vi.fn(),
  sendNewSetupLink: vi.fn(),
  deleteGymRequest: vi.fn(),
}));

function details(
  overrides: Partial<GymRequestDetails> = {},
): GymRequestDetails {
  return {
    requestId: "request-1",
    requestType: "NEW_GYM",
    status: "PENDING",
    submittedAt: "2026-10-20T13:15:00.000Z",
    contact: {
      firstName: "Nora",
      lastName: "Patel",
      email: "nora@boulderhaus.ca",
      phone: "+1 (416) 555-0199",
      jobTitle: "Owner",
    },
    details:
      "We open in November.\nOur setters have run local comps for five years.",
    proposedGym: {
      name: "Boulderhaus Leslieville",
      location: "1220 Queen St E, Toronto",
    },
    gym: null,
    checks: { emailHasAccount: false, gymAlreadyRegistered: false },
    review: null,
    accountSetup: null,
    deletable: false,
    expiresAt: "2026-11-19T13:15:00.000Z",
    ...overrides,
  };
}

const hogtown = {
  gymId: "gym-1",
  name: "Hogtown Boulders",
  location: "1 Bathurst St, Toronto",
  status: "ACTIVE" as const,
};

const adminReview = {
  reviewedBy: {
    userId: "admin-1",
    firstName: "Ada",
    lastName: "Admin",
    email: "admin@topsend.test",
  },
  reviewedAt: "2026-10-21T14:00:00.000Z",
  rejectionReason: null,
};

function openPage(path = "/admin/gym-requests/request-1") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function signedInAs(role: Role) {
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
    csrfToken: "test",
    sessionCookie: true,
  });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({
    userId: "user-1",
    role,
    token: "test-token",
    expiresAt: "2099-01-01T00:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "user-1",
    email: "person@topsend.test",
    role,
    session: { expiresIn: 3600, limitReached: false },
  });
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

function valueOf(container: HTMLElement, term: string) {
  const dt = within(container).getByText(term, { selector: "dt" });
  return dt.nextElementSibling as HTMLElement;
}

function textOf(container: HTMLElement, term: string) {
  return valueOf(container, term).textContent?.replace(/\s+/g, " ");
}

beforeEach(() => {
  signedInAs("ADMIN");
  vi.mocked(getGymRequest).mockReset().mockResolvedValue(details());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-035 criterion 2: one gym request's details", () => {
  it("shows the applicant's contact details and what they added", async () => {
    openPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Gym request" }),
    ).toBeTruthy();
    expect(getGymRequest).toHaveBeenCalledExactlyOnceWith(
      "request-1",
      expect.any(AbortSignal),
    );
    const applicant = section("Applicant");
    expect(textOf(applicant, "Name")).toBe("Nora Patel");
    expect(
      within(applicant)
        .getByRole("link", { name: "nora@boulderhaus.ca" })
        .getAttribute("href"),
    ).toBe("mailto:nora@boulderhaus.ca");
    expect(
      within(applicant)
        .getByRole("link", { name: "+1 (416) 555-0199" })
        .getAttribute("href"),
    ).toBe("tel:+14165550199");
    expect(textOf(applicant, "Job title")).toBe("Owner");
    expect(
      within(applicant).getByText(/We open in November\./).textContent,
    ).toBe(
      "We open in November.\nOur setters have run local comps for five years.",
    );
    expect(document.title).toBe(
      "Gym request for Boulderhaus Leslieville | TopSend",
    );
  });

  it("shows the gym a new-gym request submitted, with the request type, date, and status", async () => {
    openPage();

    const gym = await screen.findByRole("region", { name: "New gym" });
    expect(
      within(gym).getByText(
        "The applicant wants to register this gym on TopSend.",
      ),
    ).toBeTruthy();
    expect(textOf(gym, "Gym name")).toBe("Boulderhaus Leslieville");
    expect(textOf(gym, "Location")).toBe("1220 Queen St E, Toronto");
    expect(within(gym).queryByText("Gym status")).toBeNull();
    expect(within(gym).queryByRole("link")).toBeNull();

    const review = section("Review");
    expect(textOf(review, "Status")).toBe("Pending");
    expect(textOf(review, "Request type")).toBe(
      "New gymRegister a gym that isn't on TopSend yet",
    );
    expect(
      within(valueOf(review, "Submitted"))
        .getByText("Oct 20, 2026, 9:15 a.m.")
        .getAttribute("datetime"),
    ).toBe("2026-10-20T13:15:00.000Z");
  });

  it("shows when a pending request is deleted automatically", async () => {
    openPage();

    const review = await screen.findByRole("region", { name: "Review" });
    expect(textOf(review, "Expires")).toBe(
      "Nov 19, 2026, 8:15 a.m.Pending requests are deleted automatically 30 days after they're sent.",
    );
    expect(
      within(valueOf(review, "Expires"))
        .getByText("Nov 19, 2026, 8:15 a.m.")
        .getAttribute("datetime"),
    ).toBe("2026-11-19T13:15:00.000Z");
  });

  it("shows the existing gym an access request selected, with its status and a link to it", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      details({
        requestType: "EXISTING_GYM",
        proposedGym: null,
        gym: hogtown,
        checks: {
          emailHasAccount: false,
          gymRegistered: true,
          gymActive: true,
        },
      }),
    );
    openPage();

    const gym = await screen.findByRole("region", { name: "Selected gym" });
    expect(textOf(gym, "Gym name")).toBe("Hogtown Boulders");
    expect(textOf(gym, "Location")).toBe("1 Bathurst St, Toronto");
    expect(textOf(gym, "Gym status")).toBe("Active");
    expect(
      within(gym)
        .getByRole("link", { name: "View gym details for Hogtown Boulders" })
        .getAttribute("href"),
    ).toBe("/admin/gyms/gym-1");
    expect(textOf(section("Review"), "Request type")).toContain(
      "Existing gym access",
    );
  });

  it("shows who approved a request, when, and how the applicant's account setup is going", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      details({
        status: "APPROVED",
        gym: { ...hogtown, name: "Boulderhaus Leslieville", gymId: "gym-9" },
        checks: null,
        review: adminReview,
        accountSetup: {
          completed: false,
          completedAt: null,
          linkExpiresAt: "2026-10-28T14:00:00.000Z",
          linkExpired: false,
        },
      }),
    );
    openPage();

    const review = await screen.findByRole("region", { name: "Review" });
    expect(textOf(review, "Status")).toBe("Approved");
    expect(within(review).queryByText("Expires", { selector: "dt" })).toBeNull();
    expect(textOf(review, "Approved")).toBe("Oct 21, 2026, 10:00 a.m.");
    expect(textOf(review, "Reviewed by")).toBe("Ada Admin");
    expect(textOf(review, "Account setup")).toBe(
      "Waiting for the applicantSetup link expires Oct 28, 2026, 10:00 a.m.",
    );
    const gym = section("New gym");
    expect(
      within(gym).getByText(
        "This gym was registered on TopSend when the request was approved.",
      ),
    ).toBeTruthy();
    expect(
      within(gym).getByRole("link", {
        name: "View gym details for Boulderhaus Leslieville",
      }),
    ).toBeTruthy();
  });

  it("shows a rejection's reason, or that none was given", async () => {
    vi.mocked(getGymRequest).mockResolvedValueOnce(
      details({
        status: "REJECTED",
        checks: null,
        review: {
          ...adminReview,
          rejectionReason: "We couldn't verify the gym.",
        },
      }),
    );
    openPage();

    const review = await screen.findByRole("region", { name: "Review" });
    expect(textOf(review, "Rejected")).toBe("Oct 21, 2026, 10:00 a.m.");
    expect(textOf(review, "Reason")).toBe("We couldn't verify the gym.");
    cleanup();

    vi.mocked(getGymRequest).mockResolvedValueOnce(
      details({ status: "REJECTED", checks: null, review: adminReview }),
    );
    openPage();
    expect(
      textOf(await screen.findByRole("region", { name: "Review" }), "Reason"),
    ).toBe("No reason given");
  });

  it("shows a loading state while the request loads", async () => {
    vi.mocked(getGymRequest).mockReturnValue(new Promise(() => {}));
    openPage();

    expect(await screen.findByText("Loading request…")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Applicant" })).toBeNull();
  });

  it("says when a request can't be found or its link is invalid, without offering a retry", async () => {
    vi.mocked(getGymRequest).mockRejectedValueOnce(
      new ApiError(404, "GYM_REQUEST_NOT_FOUND", "Gym request not found."),
    );
    openPage();
    const missing = await screen.findByRole("alert");
    expect(missing.textContent).toBe(
      "This request could not be found. It may no longer be available.",
    );
    expect(within(missing).queryByRole("button")).toBeNull();
    cleanup();

    vi.mocked(getGymRequest).mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_ERROR", "Invalid request id."),
    );
    openPage("/admin/gym-requests/not-an-id");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This request link is invalid. Choose a request from the list.",
    );
  });

  it("explains a failed load and loads again from Try again", async () => {
    vi.mocked(getGymRequest)
      .mockRejectedValueOnce(
        new ApiError(
          0,
          "NETWORK_ERROR",
          "Couldn't reach the server. Check your connection and try again.",
        ),
      )
      .mockResolvedValue(details());
    openPage();

    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("region", { name: "Applicant" }),
    ).toBeTruthy();
    expect(getGymRequest).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Review" }),
      ),
    );
  });

  it("loads the request again from Refresh request, and moves focus to the review", async () => {
    openPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Refresh request" }),
    );

    expect(
      await screen.findByRole("region", { name: "Applicant" }),
    ).toBeTruthy();
    expect(getGymRequest).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Review" }),
      ),
    );
  });

  it("moves focus to the error when loading fails again after Try again", async () => {
    vi.mocked(getGymRequest).mockRejectedValue(
      new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "The database isn't reachable right now.",
      ),
    );
    openPage();

    fireEvent.click(
      within(await screen.findByRole("alert")).getByRole("button", {
        name: "Try again",
      }),
    );

    await waitFor(() => expect(getGymRequest).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("alert")),
    );
  });

  it("names a request saved without contact details instead of leaving it blank", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      details({
        contact: {
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          jobTitle: null,
        },
        details: null,
        proposedGym: null,
      }),
    );
    openPage();

    const applicant = await screen.findByRole("region", { name: "Applicant" });
    expect(textOf(applicant, "Name")).toBe("Name not given");
    expect(textOf(applicant, "Email")).toBe("Not given");
    expect(textOf(applicant, "Phone")).toBe("Not given");
    expect(
      within(applicant).getByText("The applicant didn't add anything else."),
    ).toBeTruthy();
    expect(textOf(section("New gym"), "Gym name")).toBe("Not given");
  });

  it("shows other roles a message and never loads the request", async () => {
    signedInAs("CLIMBER");
    openPage();

    expect(
      await screen.findByText("Administrator access required"),
    ).toBeTruthy();
    expect(getGymRequest).not.toHaveBeenCalled();
  });
});
