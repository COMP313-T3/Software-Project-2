import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App.tsx";
import { ApiError } from "../../lib/apiClient.ts";
import {
  deleteGymRequest,
  getGymRequest,
  listGymRequests,
  reviewGymRequest,
  sendNewSetupLink,
  type GymRequestDetails,
  type GymRequestReviewResult,
} from "../../lib/gymRequestReviewApi.ts";
import * as sessionApi from "../../lib/sessionApi.ts";

vi.mock("../../lib/gymRequestReviewApi.ts", () => ({
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
      phone: "416-555-0199",
      jobTitle: "Owner",
    },
    details: null,
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

const rejectedRequest = (rejectionReason: string | null = null) =>
  details({
    status: "REJECTED",
    checks: null,
    review: { ...review, rejectionReason },
    deletable: true,
    expiresAt: null,
  });

const review = {
  reviewedBy: {
    userId: "admin-1",
    firstName: "Ada",
    lastName: "Admin",
    email: "admin@topsend.test",
  },
  reviewedAt: "2026-10-21T14:00:00.000Z",
  rejectionReason: null,
};

const approved = details({
  status: "APPROVED",
  gym: {
    gymId: "gym-9",
    name: "Boulderhaus Leslieville",
    location: "1220 Queen St E, Toronto",
    status: "ACTIVE",
  },
  checks: null,
  review,
  accountSetup: {
    completed: false,
    completedAt: null,
    linkExpiresAt: "2026-10-28T14:00:00.000Z",
    linkExpired: false,
  },
  expiresAt: null,
});

function approval(emailSent = true): GymRequestReviewResult {
  return {
    message: emailSent
      ? "Request approved. We're emailing the applicant a link to set up their Gym Administrator account."
      : "Request approved, but email is off, so the setup link wasn't sent. Once email works, send a new setup link.",
    request: approved,
    emailSent,
  };
}

function openPage() {
  render(
    <MemoryRouter initialEntries={["/admin/gym-requests/request-1"]}>
      <App />
    </MemoryRouter>,
  );
}

async function controls() {
  const panel = await screen.findByRole("region", { name: "Review" });
  return {
    panel,
    approve: within(panel).getByRole("button", {
      name: "Approve request",
    }) as HTMLButtonElement,
    reject: within(panel).getByRole("button", {
      name: "Reject request",
    }) as HTMLButtonElement,
  };
}

function statusIn(panel: HTMLElement) {
  return within(panel).getByText("Status", { selector: "dt" })
    .nextElementSibling?.textContent;
}

beforeEach(() => {
  vi.mocked(sessionApi.fetchCsrfToken).mockResolvedValue({
    csrfToken: "test",
    sessionCookie: true,
  });
  vi.mocked(sessionApi.refreshSession).mockResolvedValue({
    userId: "admin-1",
    role: "ADMIN",
    token: "test-token",
    expiresAt: "2099-01-01T00:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "admin-1",
    email: "admin@topsend.test",
    role: "ADMIN",
    session: { expiresIn: 3600, limitReached: false },
  });
  vi.mocked(getGymRequest).mockReset().mockResolvedValue(details());
  vi.mocked(reviewGymRequest).mockReset();
  vi.mocked(sendNewSetupLink).mockReset();
  vi.mocked(deleteGymRequest).mockReset();
  vi.mocked(listGymRequests)
    .mockReset()
    .mockResolvedValue({ requests: [], total: 0, page: 1, limit: 20 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-035 criterion 3: approve and reject controls", () => {
  it("offers Approve and Reject for a pending request", async () => {
    openPage();
    const { panel, approve, reject } = await controls();

    expect(approve.disabled).toBe(false);
    expect(reject.disabled).toBe(false);
    expect(
      within(panel).getByText(
        "Both ask you to confirm first. A decision can't be undone.",
      ),
    ).toBeTruthy();
    const approveHint = document.getElementById(
      approve.getAttribute("aria-describedby") ?? "",
    );
    expect(approveHint?.textContent).toBe(
      "You confirm before anything is saved. Approving lets the applicant set up a Gym Administrator account.",
    );
  });

  it("confirms before approving, and Cancel closes the dialog without saving", async () => {
    openPage();
    const { approve } = await controls();
    approve.focus();
    fireEvent.click(approve);

    const dialog = screen.getByRole("alertdialog", {
      name: "Approve the request from Nora Patel?",
    });
    expect(
      within(dialog).getByText(
        /registers Boulderhaus Leslieville as an active gym on TopSend/,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Nora gets access only after setting up the account. You can't undo an approval.",
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reviewGymRequest).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(approve);
  });

  it("confirms before rejecting, and Esc closes the dialog without saving", async () => {
    openPage();
    const { reject } = await controls();
    fireEvent.click(reject);

    const dialog = screen.getByRole("alertdialog", {
      name: "Reject the request from Nora Patel?",
    });
    expect(
      within(dialog).getByText(
        "Boulderhaus Leslieville won't be registered, and Nora Patel won't get Gym Administrator access.",
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByLabelText("Reason for rejecting (optional)"),
    );

    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reviewGymRequest).not.toHaveBeenCalled();
  });

  it("approves once, shows that it's working, then shows the new status and locks the controls", async () => {
    let finish: (result: GymRequestReviewResult) => void = () => undefined;
    vi.mocked(reviewGymRequest).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    openPage();
    const { panel, approve } = await controls();
    fireEvent.click(approve);
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Approve request",
    });

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(reviewGymRequest).toHaveBeenCalledExactlyOnceWith("request-1", {
      decision: "APPROVE",
    });
    expect(confirm.textContent).toBe("Approving…");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Cancel",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(dialog).getByRole("status").textContent).toBe(
      "Saving your decision…",
    );
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.getByRole("alertdialog")).toBe(dialog);
    fireEvent(dialog, new Event("cancel", { cancelable: false }));
    (dialog as HTMLDialogElement).close();
    await waitFor(() => expect((dialog as HTMLDialogElement).open).toBe(true));
    expect(screen.getByRole("alertdialog")).toBe(dialog);
    expect(reviewGymRequest).toHaveBeenCalledTimes(1);

    await act(async () => finish(approval()));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    const notice = screen.getByText(
      "Request approved. We're emailing the applicant a link to set up their Gym Administrator account.",
    );
    expect(document.activeElement).toBe(notice);
    expect(statusIn(panel)).toBe("Approved");
    expect(
      (
        within(panel).getByRole("button", {
          name: "Approve request",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(panel).getByRole("button", {
          name: "Reject request",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      within(panel).getByText(
        "This request was approved. Only pending requests can be approved or rejected.",
      ),
    ).toBeTruthy();
    expect(reviewGymRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects with the trimmed reason, and shows the reason with the new status", async () => {
    vi.mocked(reviewGymRequest).mockResolvedValue({
      message:
        "Request rejected. We're emailing the applicant to let them know.",
      request: rejectedRequest("We couldn't verify the gym."),
      emailSent: true,
    });
    openPage();
    const { panel, reject } = await controls();
    fireEvent.click(reject);
    const dialog = screen.getByRole("alertdialog");
    const reason = within(dialog).getByLabelText(
      "Reason for rejecting (optional)",
    );

    fireEvent.change(reason, {
      target: { value: "  We couldn't verify the gym.  " },
    });
    expect(within(dialog).getByText("31 of 500 characters")).toBeTruthy();
    expect(reason.getAttribute("maxlength")).toBe("500");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reject request" }),
    );

    expect(
      await screen.findByText(
        "Request rejected. We're emailing the applicant to let them know.",
      ),
    ).toBeTruthy();
    expect(reviewGymRequest).toHaveBeenCalledExactlyOnceWith("request-1", {
      decision: "REJECT",
      reason: "We couldn't verify the gym.",
    });
    expect(statusIn(panel)).toBe("Rejected");
    expect(within(panel).getByText("We couldn't verify the gym.")).toBeTruthy();
    expect(
      (
        within(panel).getByRole("button", {
          name: "Reject request",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("rejects without a reason when the reason is left blank", async () => {
    vi.mocked(reviewGymRequest).mockResolvedValue({
      message:
        "Request rejected. We're emailing the applicant to let them know.",
      request: rejectedRequest(),
      emailSent: true,
    });
    openPage();
    fireEvent.click((await controls()).reject);
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(
      within(dialog).getByLabelText("Reason for rejecting (optional)"),
      { target: { value: "   " } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reject request" }),
    );

    await screen.findByText(
      "Request rejected. We're emailing the applicant to let them know.",
    );
    expect(reviewGymRequest).toHaveBeenCalledExactlyOnceWith("request-1", {
      decision: "REJECT",
      reason: undefined,
    });
  });

  it("keeps the dialog open after a failed try, and reloads the request when it's then cancelled", async () => {
    vi.mocked(reviewGymRequest)
      .mockRejectedValueOnce(
        new ApiError(
          500,
          "INTERNAL_ERROR",
          "Something went wrong. Please try again.",
        ),
      )
      .mockRejectedValueOnce(
        new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."),
      );
    openPage();
    const { panel, approve } = await controls();
    fireEvent.click(approve);
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Approve request",
    });

    fireEvent.click(confirm);
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Something went wrong. Please try again.",
    );
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Cancel",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    fireEvent.click(confirm);
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe(
        "We couldn't confirm your decision with TopSend. Check your connection, then try again.",
      ),
    );
    expect(reviewGymRequest).toHaveBeenCalledTimes(2);
    expect(statusIn(panel)).toBe("Pending");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(getGymRequest).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Review" }),
      ),
    );
  });

  it("closes and reloads the request when an approval check now fails, so Approve is disabled", async () => {
    vi.mocked(reviewGymRequest).mockRejectedValue(
      new ApiError(
        409,
        "EMAIL_TAKEN",
        "The applicant's email now has a TopSend account, so a Gym Administrator account can't be set up with it. Reject this request and ask the applicant to apply with another email.",
      ),
    );
    vi.mocked(getGymRequest)
      .mockResolvedValueOnce(details())
      .mockResolvedValue(
        details({
          checks: { emailHasAccount: true, gymAlreadyRegistered: false },
        }),
      );
    openPage();
    fireEvent.click((await controls()).approve);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Approve request",
      }),
    );

    const notice = await screen.findByText(
      /^The applicant's email now has a TopSend account/,
      { selector: "[role=status]" },
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(notice);
    await waitFor(() => expect(getGymRequest).toHaveBeenCalledTimes(2));
    const { panel, approve, reject } = await controls();
    expect(
      within(panel).getByText(
        /^The applicant's email already has a TopSend account/,
      ),
    ).toBeTruthy();
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(false);
    expect(reviewGymRequest).toHaveBeenCalledTimes(1);
  });

  it("closes and reloads when the request no longer exists", async () => {
    vi.mocked(reviewGymRequest).mockRejectedValue(
      new ApiError(404, "GYM_REQUEST_NOT_FOUND", "Gym request not found."),
    );
    vi.mocked(getGymRequest)
      .mockResolvedValueOnce(details())
      .mockRejectedValue(
        new ApiError(404, "GYM_REQUEST_NOT_FOUND", "Gym request not found."),
      );
    openPage();
    fireEvent.click((await controls()).reject);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Reject request",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This request could not be found. It may no longer be available.",
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("region", { name: "Review" })).toBeNull();
  });

  it("shows that a rejection is being saved, and Esc puts focus back on Reject when nothing was sent", async () => {
    let finish: (result: GymRequestReviewResult) => void = () => undefined;
    vi.mocked(reviewGymRequest).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    openPage();
    const { reject } = await controls();
    reject.focus();
    fireEvent.click(reject);
    let dialog = screen.getByRole("alertdialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(reject);

    fireEvent.click(reject);
    dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Reject request",
    });
    fireEvent.click(confirm);

    expect(confirm.textContent).toBe("Rejecting…");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(
      within(dialog)
        .getByLabelText("Reason for rejecting (optional)")
        .hasAttribute("readonly"),
    ).toBe(true);
    await act(async () =>
      finish({
        message:
          "Request rejected. We're emailing the applicant to let them know.",
        request: rejectedRequest(),
        emailSent: true,
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows the API's message for the reason when the API refuses it", async () => {
    vi.mocked(reviewGymRequest).mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
        reason: "Use 500 characters or fewer.",
      }),
    );
    openPage();
    fireEvent.click((await controls()).reject);
    const dialog = screen.getByRole("alertdialog");
    const reason = within(dialog).getByLabelText(
      "Reason for rejecting (optional)",
    );
    fireEvent.change(reason, { target: { value: "Too long for the API" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reject request" }),
    );

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Use 500 characters or fewer.",
    );
    expect(reason.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(reason);
  });

  it("reloads the request when it was already reviewed elsewhere, and explains why", async () => {
    vi.mocked(reviewGymRequest).mockRejectedValue(
      new ApiError(
        409,
        "GYM_REQUEST_ALREADY_REVIEWED",
        "This request was already approved. Only pending requests can be approved or rejected.",
      ),
    );
    vi.mocked(getGymRequest)
      .mockResolvedValueOnce(details())
      .mockResolvedValue(approved);
    openPage();
    fireEvent.click((await controls()).reject);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Reject request",
      }),
    );

    expect(
      await screen.findByText(
        "This request was already approved. Only pending requests can be approved or rejected.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const { panel, approve, reject } = await controls();
    expect(statusIn(panel)).toBe("Approved");
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
    expect(getGymRequest).toHaveBeenCalledTimes(2);
  });

  it("says when the applicant's email wasn't sent", async () => {
    vi.mocked(reviewGymRequest).mockResolvedValue(approval(false));
    openPage();
    fireEvent.click((await controls()).approve);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Approve request",
      }),
    );

    expect(
      await screen.findByText(
        "Request approved, but email is off, so the setup link wasn't sent. Once email works, send a new setup link.",
      ),
    ).toBeTruthy();
  });

  it("keeps both controls disabled for a request that isn't pending", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      rejectedRequest("Duplicate request."),
    );
    openPage();
    const { panel, approve, reject } = await controls();

    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
    expect(approve.hasAttribute("aria-describedby")).toBe(false);
    expect(reject.hasAttribute("aria-describedby")).toBe(false);
    expect(
      within(panel).getByText(
        "This request was rejected. Only pending requests can be approved or rejected. You can delete it once you no longer need it.",
      ),
    ).toBeTruthy();
  });

  it("explains why an approval would fail and only allows a rejection", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      details({
        checks: { emailHasAccount: true, gymAlreadyRegistered: false },
      }),
    );
    openPage();
    const { panel, approve, reject } = await controls();

    expect(
      within(panel).getByText(
        /The applicant's email already has a TopSend account/,
      ).textContent,
    ).toContain(
      "Reject this request and ask the applicant to apply with another email.",
    );
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(false);
  });

  it("blocks approving a new gym that's already registered, or an access request for a gym that's gone", async () => {
    vi.mocked(getGymRequest).mockResolvedValueOnce(
      details({
        checks: { emailHasAccount: false, gymAlreadyRegistered: true },
      }),
    );
    openPage();
    let { panel, approve } = await controls();
    expect(
      within(panel).getByText(
        /A gym with this name and location is already on TopSend/,
      ),
    ).toBeTruthy();
    expect(approve.disabled).toBe(true);
    cleanup();

    vi.mocked(getGymRequest).mockResolvedValueOnce(
      details({
        requestType: "EXISTING_GYM",
        proposedGym: null,
        gym: null,
        checks: {
          emailHasAccount: false,
          gymRegistered: false,
          gymActive: false,
        },
      }),
    );
    openPage();
    ({ panel, approve } = await controls());
    expect(
      within(panel).getByText(
        "The selected gym is no longer registered on TopSend. Reject this request instead.",
      ),
    ).toBeTruthy();
    expect(approve.disabled).toBe(true);
  });

  it("notes an inactive selected gym without blocking the approval", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      details({
        requestType: "EXISTING_GYM",
        proposedGym: null,
        gym: {
          gymId: "gym-1",
          name: "Hogtown Boulders",
          location: "1 Bathurst St, Toronto",
          status: "INACTIVE",
        },
        checks: {
          emailHasAccount: false,
          gymRegistered: true,
          gymActive: false,
        },
      }),
    );
    openPage();
    const { panel, approve } = await controls();

    expect(
      within(panel).getByText(
        "The selected gym isn't active. If you approve, the applicant can manage its competitions once it's activated.",
      ),
    ).toBeTruthy();
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(
      within(screen.getByRole("alertdialog")).getByText(
        "This lets Nora Patel set up a Gym Administrator account for Hogtown Boulders.",
      ),
    ).toBeTruthy();
  });
});

const noContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  jobTitle: null,
};

function contactlessRequest(): GymRequestDetails {
  return details({
    contact: noContact,
    checks: {
      contactMissing: true,
      emailHasAccount: false,
      gymAlreadyRegistered: false,
    },
    deletable: true,
  });
}

function deleteButton(panel: HTMLElement) {
  return within(panel).getByRole("button", {
    name: "Delete request",
  }) as HTMLButtonElement;
}

describe("Deleting a request", () => {
  it("disables Approve and Reject for a pending request without contact details, and offers Delete", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(contactlessRequest());
    openPage();
    const { panel, approve, reject } = await controls();

    expect(
      within(panel).getByText(
        "This request has no contact details, so it can't be approved or rejected. Delete it instead.",
      ),
    ).toBeTruthy();
    expect(approve.disabled).toBe(true);
    expect(reject.disabled).toBe(true);
    const remove = deleteButton(panel);
    expect(remove.disabled).toBe(false);
    expect(
      document.getElementById(remove.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(
      "You confirm before anything is deleted. A deleted request can't be restored.",
    );
    expect(
      within(panel).getByText(
        "Delete asks you to confirm first. A deleted request can't be restored.",
      ),
    ).toBeTruthy();
  });

  it("doesn't offer Delete for a pending request with contact details or an approved one", async () => {
    openPage();
    let { panel } = await controls();
    expect(within(panel).queryByRole("button", { name: "Delete request" })).toBeNull();
    cleanup();

    vi.mocked(getGymRequest).mockResolvedValue(approved);
    openPage();
    ({ panel } = await controls());
    expect(within(panel).queryByRole("button", { name: "Delete request" })).toBeNull();
  });

  it("confirms before deleting, and Cancel keeps the request and puts focus back", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(rejectedRequest());
    openPage();
    const { panel } = await controls();
    const remove = deleteButton(panel);
    remove.focus();
    fireEvent.click(remove);

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete the request from Nora Patel?",
    });
    expect(
      within(dialog).getByText(
        "Deleting it removes this rejected request from TopSend. The applicant isn't emailed.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("You can't undo this.")).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(deleteGymRequest).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(remove);
  });

  it("deletes once, then goes back to the list and says the request was deleted", async () => {
    let finish: (result: { message: string }) => void = () => undefined;
    vi.mocked(deleteGymRequest).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(getGymRequest).mockResolvedValue(contactlessRequest());
    openPage();
    fireEvent.click(deleteButton((await controls()).panel));
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete this request?",
    });
    expect(
      within(dialog).getByText(
        "This request has no contact details, so it can't be approved or rejected. Deleting it removes it from TopSend.",
      ),
    ).toBeTruthy();
    const confirm = within(dialog).getByRole("button", {
      name: "Delete request",
    });

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(deleteGymRequest).toHaveBeenCalledExactlyOnceWith("request-1");
    expect(confirm.textContent).toBe("Deleting…");
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(within(dialog).getByRole("status").textContent).toBe(
      "Deleting the request…",
    );
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.getByRole("alertdialog")).toBe(dialog);

    await act(async () => finish({ message: "Request deleted." }));

    const notice = await screen.findByText("Request deleted.");
    expect(notice.getAttribute("role")).toBe("status");
    expect(document.activeElement).toBe(notice);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Requests" }),
    ).toBeTruthy();
    expect(listGymRequests).toHaveBeenCalled();
    expect(deleteGymRequest).toHaveBeenCalledTimes(1);
  });

  it("closes and reloads the request when it can't be deleted anymore, and explains why", async () => {
    vi.mocked(deleteGymRequest).mockRejectedValue(
      new ApiError(
        409,
        "GYM_REQUEST_NOT_DELETABLE",
        "Only rejected requests, and pending requests without contact details, can be deleted.",
      ),
    );
    vi.mocked(getGymRequest)
      .mockResolvedValueOnce(rejectedRequest())
      .mockResolvedValue(approved);
    openPage();
    fireEvent.click(deleteButton((await controls()).panel));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete request",
      }),
    );

    const notice = await screen.findByText(
      "Only rejected requests, and pending requests without contact details, can be deleted.",
      { selector: "[role=status]" },
    );
    expect(document.activeElement).toBe(notice);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(getGymRequest).toHaveBeenCalledTimes(2));
    const { panel } = await controls();
    expect(statusIn(panel)).toBe("Approved");
    expect(within(panel).queryByRole("button", { name: "Delete request" })).toBeNull();
  });

  it("keeps the dialog open after a lost connection, and reloads the request when it's then cancelled", async () => {
    vi.mocked(deleteGymRequest).mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."),
    );
    vi.mocked(getGymRequest).mockResolvedValue(rejectedRequest());
    openPage();
    fireEvent.click(deleteButton((await controls()).panel));
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Delete request",
    });

    fireEvent.click(confirm);

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "We couldn't confirm the request was deleted. Check your connection, then try again.",
    );
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(getGymRequest).toHaveBeenCalledTimes(2));
  });
});

describe("US-035 criterion 6: sending a new setup link", () => {
  const expired = details({
    ...approved,
    accountSetup: {
      completed: false,
      completedAt: null,
      linkExpiresAt: "2026-10-20T14:00:00.000Z",
      linkExpired: true,
    },
  });

  function linkButton(panel: HTMLElement) {
    return within(panel).getByRole("button", {
      name: /^(Send a new setup link|Sending link…)$/,
    }) as HTMLButtonElement;
  }

  it("sends the link once, shows that it's working, then shows the API's message and the new expiry", async () => {
    let finish: (result: GymRequestReviewResult) => void = () => undefined;
    vi.mocked(sendNewSetupLink).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(getGymRequest).mockResolvedValue(expired);
    openPage();
    const { panel } = await controls();
    expect(within(panel).getByText("Setup link expired", { exact: false })).toBeTruthy();
    const send = linkButton(panel);
    expect(
      document.getElementById(send.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(
      "Emails the applicant a new link that works for 7 days. Older links stop working.",
    );

    fireEvent.click(send);
    fireEvent.click(send);

    expect(sendNewSetupLink).toHaveBeenCalledExactlyOnceWith("request-1");
    expect(send.textContent).toBe("Sending link…");
    expect(send.getAttribute("aria-disabled")).toBe("true");

    await act(async () =>
      finish({
        message:
          "We're emailing the applicant a new setup link. Older links no longer work.",
        request: approved,
        emailSent: true,
      }),
    );

    const notice = screen.getByText(
      "We're emailing the applicant a new setup link. Older links no longer work.",
    );
    expect(document.activeElement).toBe(notice);
    expect(within(panel).getByText("Waiting for the applicant")).toBeTruthy();
    expect(linkButton(panel).textContent).toBe("Send a new setup link");
    expect(sendNewSetupLink).toHaveBeenCalledTimes(1);
  });

  it("reloads the request when the applicant already set up their account", async () => {
    vi.mocked(sendNewSetupLink).mockRejectedValue(
      new ApiError(
        409,
        "SETUP_ALREADY_COMPLETED",
        "The applicant already set up their Gym Administrator account.",
      ),
    );
    vi.mocked(getGymRequest)
      .mockResolvedValueOnce(expired)
      .mockResolvedValue(
        details({
          ...approved,
          accountSetup: {
            completed: true,
            completedAt: "2026-10-22T09:00:00.000Z",
            linkExpiresAt: null,
            linkExpired: false,
          },
        }),
      );
    openPage();
    fireEvent.click(linkButton((await controls()).panel));

    expect(
      await screen.findByText(
        "The applicant already set up their Gym Administrator account.",
        { selector: "[role=status]" },
      ),
    ).toBeTruthy();
    await waitFor(() => expect(getGymRequest).toHaveBeenCalledTimes(2));
    const { panel } = await controls();
    expect(within(panel).getByText("Completed")).toBeTruthy();
    expect(
      within(panel).queryByRole("button", { name: "Send a new setup link" }),
    ).toBeNull();
  });

  it("says when the link couldn't be sent, and lets the Admin try again", async () => {
    vi.mocked(sendNewSetupLink).mockRejectedValue(
      new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."),
    );
    vi.mocked(getGymRequest).mockResolvedValue(expired);
    openPage();
    const { panel } = await controls();
    fireEvent.click(linkButton(panel));

    expect((await within(panel).findByRole("alert")).textContent).toBe(
      "We couldn't reach TopSend, so the new link may not have been sent. Check your connection, then try again.",
    );
    const send = linkButton(panel);
    expect(send.textContent).toBe("Send a new setup link");
    expect(send.getAttribute("aria-disabled")).toBeNull();
    expect(getGymRequest).toHaveBeenCalledTimes(1);
  });

  it("isn't offered once the account is set up, or when the request has no email", async () => {
    vi.mocked(getGymRequest).mockResolvedValue(
      details({
        ...approved,
        accountSetup: {
          completed: true,
          completedAt: "2026-10-22T09:00:00.000Z",
          linkExpiresAt: null,
          linkExpired: false,
        },
      }),
    );
    openPage();
    let { panel } = await controls();
    expect(
      within(panel).queryByRole("button", { name: "Send a new setup link" }),
    ).toBeNull();
    cleanup();

    vi.mocked(getGymRequest).mockResolvedValue(
      details({ ...expired, contact: noContact }),
    );
    openPage();
    ({ panel } = await controls());
    expect(
      within(panel).queryByRole("button", { name: "Send a new setup link" }),
    ).toBeNull();
  });
});

