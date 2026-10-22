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
  listGymRequests,
  type GymRequestDetails,
  type GymRequestPage,
  type GymRequestSummary,
} from "../lib/gymRequestReviewApi.ts";
import * as sessionApi from "../lib/sessionApi.ts";

vi.mock("../lib/gymRequestReviewApi.ts", () => ({
  listGymRequests: vi.fn(),
  getGymRequest: vi.fn(),
  reviewGymRequest: vi.fn(),
  sendNewSetupLink: vi.fn(),
  deleteGymRequest: vi.fn(),
}));

const newGym: GymRequestSummary = {
  requestId: "request-1",
  requestType: "NEW_GYM",
  status: "PENDING",
  submittedAt: "2026-10-20T13:15:00.000Z",
  reviewedAt: null,
  contact: {
    firstName: "Nora",
    lastName: "Patel",
    email: "nora@boulderhaus.ca",
  },
  gym: {
    gymId: null,
    name: "Boulderhaus Leslieville",
    location: "1220 Queen St E, Toronto",
    status: null,
  },
};

const existingGym: GymRequestSummary = {
  requestId: "request-2",
  requestType: "EXISTING_GYM",
  status: "PENDING",
  submittedAt: "2026-10-21T01:05:00.000Z",
  reviewedAt: null,
  contact: { firstName: "Eli", lastName: "Moreau", email: "eli@hogtown.ca" },
  gym: {
    gymId: "gym-1",
    name: "Hogtown Boulders",
    location: "1 Bathurst St, Toronto",
    status: "ACTIVE",
  },
};

function page(
  requests: GymRequestSummary[],
  total = requests.length,
  pageNumber = 1,
): GymRequestPage {
  return { requests, total, page: pageNumber, limit: 20 };
}

function openPage(path = "/admin/gym-requests") {
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

function itemFor(name: string) {
  return screen
    .getByRole("heading", { level: 3, name })
    .closest("li") as HTMLElement;
}

beforeEach(() => {
  signedInAs("ADMIN");
  vi.mocked(listGymRequests)
    .mockReset()
    .mockResolvedValue(page([newGym, existingGym]));
  vi.mocked(getGymRequest)
    .mockReset()
    .mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-035 criteria 1 and 2: the gym request review list", () => {
  it("opens as an ADMIN page in the layout and lists pending requests first", async () => {
    openPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Gym requests" }),
    ).toBeTruthy();
    expect(await screen.findByText("2 pending requests")).toBeTruthy();
    expect(listGymRequests).toHaveBeenCalledExactlyOnceWith(
      { status: "PENDING", requestType: "", page: 1 },
      expect.any(AbortSignal),
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getByRole("link", { name: "Gym requests" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(document.title).toBe("Gym requests | TopSend");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "PENDING",
    );
  });

  it("shows each applicant's contact, the request type, the gym, the submission date, and the status", async () => {
    openPage();
    await screen.findByRole("heading", { level: 3, name: "Nora Patel" });

    const nora = itemFor("Nora Patel");
    expect(within(nora).getByText("nora@boulderhaus.ca")).toBeTruthy();
    expect(within(nora).getByText("New gym")).toBeTruthy();
    expect(within(nora).getByText("Boulderhaus Leslieville")).toBeTruthy();
    expect(within(nora).getByText("1220 Queen St E, Toronto")).toBeTruthy();
    expect(
      within(nora)
        .getByText("Oct 20, 2026, 9:15 a.m.")
        .getAttribute("datetime"),
    ).toBe("2026-10-20T13:15:00.000Z");
    expect(within(nora).getByText("Pending")).toBeTruthy();

    const eli = itemFor("Eli Moreau");
    expect(within(eli).getByText("eli@hogtown.ca")).toBeTruthy();
    expect(within(eli).getByText("Existing gym access")).toBeTruthy();
    expect(within(eli).getByText("Hogtown Boulders")).toBeTruthy();
    expect(within(eli).getByText("1 Bathurst St, Toronto")).toBeTruthy();
    expect(within(eli).getByText("Oct 20, 2026, 9:05 p.m.")).toBeTruthy();
  });

  it("opens the selected request's details, and Back returns to the same filters", async () => {
    vi.mocked(listGymRequests).mockResolvedValue(page([existingGym]));
    vi.mocked(getGymRequest).mockResolvedValue({
      requestId: "request-2",
      requestType: "EXISTING_GYM",
      status: "PENDING",
      submittedAt: existingGym.submittedAt,
      contact: {
        ...existingGym.contact,
        phone: "416-555-0101",
        jobTitle: "Head setter",
      },
      details: null,
      proposedGym: null,
      gym: existingGym.gym,
      checks: { emailHasAccount: false, gymRegistered: true, gymActive: true },
      review: null,
      accountSetup: null,
      deletable: false,
      expiresAt: "2026-11-20T01:05:00.000Z",
    } satisfies GymRequestDetails);
    openPage("/admin/gym-requests?type=EXISTING_GYM");

    const link = await screen.findByRole("link", {
      name: "Review request from Eli Moreau",
    });
    expect(link.getAttribute("href")).toBe("/admin/gym-requests/request-2");
    fireEvent.click(link);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Gym request" }),
    ).toBeTruthy();
    expect(getGymRequest).toHaveBeenCalledWith(
      "request-2",
      expect.any(AbortSignal),
    );
    expect(
      screen
        .getByRole("link", { name: "Back to gym requests" })
        .getAttribute("href"),
    ).toBe("/admin/gym-requests?type=EXISTING_GYM");
  });

  it("shows a notice sent back with the link, gives it focus, and clears it when the filters change", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/admin/gym-requests",
            search: "?status=REJECTED",
            state: { notice: "Request deleted." },
          },
        ]}
      >
        <App />
      </MemoryRouter>,
    );

    const notice = await screen.findByText("Request deleted.");
    expect(notice.getAttribute("role")).toBe("status");
    await waitFor(() => expect(document.activeElement).toBe(notice));
    expect(listGymRequests).toHaveBeenCalledWith(
      { status: "REJECTED", requestType: "", page: 1 },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("Hogtown Boulders")).toBeTruthy();
    expect(screen.getByText("Request deleted.")).toBe(notice);

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "PENDING" },
    });

    await waitFor(() =>
      expect(screen.queryByText("Request deleted.")).toBeNull(),
    );
  });

  it("asks the API again when the status or request type changes, from the first page", async () => {
    vi.mocked(listGymRequests).mockImplementation(
      async ({ page: pageNumber }) => page([newGym], 45, pageNumber),
    );
    openPage("/admin/gym-requests?page=2");
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
    expect(listGymRequests).toHaveBeenCalledExactlyOnceWith(
      { status: "PENDING", requestType: "", page: 2 },
      expect.any(AbortSignal),
    );

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "APPROVED" },
    });
    await waitFor(() =>
      expect(listGymRequests).toHaveBeenLastCalledWith(
        { status: "APPROVED", requestType: "", page: 1 },
        expect.any(AbortSignal),
      ),
    );

    fireEvent.change(screen.getByLabelText("Request type"), {
      target: { value: "NEW_GYM" },
    });
    await waitFor(() =>
      expect(listGymRequests).toHaveBeenLastCalledWith(
        { status: "APPROVED", requestType: "NEW_GYM", page: 1 },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText("45 approved requests")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
  });

  it("pages through long lists and moves focus to the list after a page loads", async () => {
    vi.mocked(listGymRequests).mockImplementation(
      async ({ page: pageNumber }) =>
        page([pageNumber === 1 ? newGym : existingGym], 21, pageNumber),
    );
    openPage();
    await screen.findByText("Page 1 of 2");
    expect(
      (screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2 of 2")).toBeTruthy();
    expect(listGymRequests).toHaveBeenLastCalledWith(
      { status: "PENDING", requestType: "", page: 2 },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Eli Moreau" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Requests" }),
      ),
    );
  });

  it("goes back to the last page when the requested page is past the end", async () => {
    vi.mocked(listGymRequests).mockImplementation(
      async ({ page: pageNumber }) =>
        pageNumber > 2
          ? page([], 21, pageNumber)
          : page([existingGym], 21, pageNumber),
    );
    openPage("/admin/gym-requests?page=7");

    expect(await screen.findByText("Page 2 of 2")).toBeTruthy();
    expect(listGymRequests).toHaveBeenLastCalledWith(
      { status: "PENDING", requestType: "", page: 2 },
      expect.any(AbortSignal),
    );
  });

  it("shows a loading state, then an empty state that fits the filters", async () => {
    let finish: (value: GymRequestPage) => void = () => undefined;
    vi.mocked(listGymRequests).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    openPage();

    expect(await screen.findByText("Loading requests…")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    finish(page([]));

    expect(
      await screen.findByRole("heading", { name: "No pending requests" }),
    ).toBeTruthy();
    expect(screen.getByText("0 pending requests")).toBeTruthy();

    vi.mocked(listGymRequests).mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText("Request type"), {
      target: { value: "EXISTING_GYM" },
    });
    expect(
      await screen.findByRole("heading", {
        name: "No requests match these filters",
      }),
    ).toBeTruthy();
  });

  it("explains a failed load and loads again from Try again", async () => {
    vi.mocked(listGymRequests)
      .mockRejectedValueOnce(
        new ApiError(
          0,
          "NETWORK_ERROR",
          "Couldn't reach the server. Check your connection and try again.",
        ),
      )
      .mockResolvedValue(page([newGym]));
    openPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't reach the server.");
    expect(screen.getByText("Requests unavailable")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 3, name: "Nora Patel" }),
    ).toBeTruthy();
    expect(listGymRequests).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "Requests" }),
      ),
    );
  });

  it("names requests saved without contact details instead of leaving them blank", async () => {
    vi.mocked(listGymRequests).mockResolvedValue(
      page([
        {
          ...newGym,
          contact: { firstName: "", lastName: "", email: "" },
          gym: null,
        },
      ]),
    );
    openPage();

    await screen.findByRole("heading", { level: 3, name: "Name not given" });
    const item = itemFor("Name not given");
    expect(within(item).getByText("Not given")).toBeTruthy();
    expect(
      within(item).getByRole("link", {
        name: "Review request from Name not given",
      }),
    ).toBeTruthy();
  });

  it("shows other roles a message and never asks the API", async () => {
    signedInAs("GYM_ADMIN");
    openPage();

    expect(
      await screen.findByText("Administrator access required"),
    ).toBeTruthy();
    expect(listGymRequests).not.toHaveBeenCalled();
  });
});
