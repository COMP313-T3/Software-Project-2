import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient.ts";
import {
  getGymRequest,
  listGymRequests,
  reviewGymRequest,
} from "./gymRequestReviewApi.ts";

vi.mock("./apiClient.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./apiClient.ts")>()),
  apiRequest: vi.fn(),
}));
vi.mock("./sessionClient.ts", () => ({
  withAccessToken: (send: (token: string) => unknown) => send("test-token"),
}));

const auth = { Authorization: "Bearer test-token" };

const serverDetails = {
  _id: "request-1",
  requestType: "EXISTING_GYM",
  status: "APPROVED",
  submittedAt: "2026-10-20T13:15:00.000Z",
  contact: {
    firstName: "Eli",
    lastName: "Moreau",
    email: "eli@hogtown.ca",
    phone: "416-555-0101",
    jobTitle: null,
  },
  details: null,
  proposedGym: null,
  gym: {
    _id: "gym-1",
    name: "Hogtown Boulders",
    location: "1 Bathurst St, Toronto",
    status: "ACTIVE",
  },
  checks: null,
  review: {
    reviewedBy: {
      _id: "admin-1",
      firstName: "Ada",
      lastName: "Admin",
      email: "admin@topsend.test",
    },
    reviewedAt: "2026-10-21T14:00:00.000Z",
    rejectionReason: null,
  },
  accountSetup: {
    completed: false,
    completedAt: null,
    userId: null,
    linkExpiresAt: "2026-10-28T14:00:00.000Z",
    linkExpired: false,
  },
};

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
});

describe("US-035 gym request review adapter", () => {
  it("reads one page of requests with the status, type, and page, and maps the IDs", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue({
      requests: [
        {
          _id: "request-2",
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
            _id: null,
            name: "Boulderhaus",
            location: "1220 Queen St E, Toronto",
            status: null,
          },
        },
      ],
      total: 21,
      page: 2,
      limit: 20,
    });

    const result = await listGymRequests(
      { status: "PENDING", requestType: "NEW_GYM", page: 2 },
      signal,
    );

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/admin/gym-requests?status=PENDING&page=2&limit=20&requestType=NEW_GYM",
      { headers: auth, signal },
    );
    expect(result.total).toBe(21);
    expect(result.requests[0]).toEqual({
      requestId: "request-2",
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
        name: "Boulderhaus",
        location: "1220 Queen St E, Toronto",
        status: null,
      },
    });
  });

  it("leaves the request type out when both types are listed", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      requests: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    await listGymRequests({ status: "ALL", requestType: "", page: 1 });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/admin/gym-requests?status=ALL&page=1&limit=20",
      { headers: auth, signal: undefined },
    );
  });

  it("keeps requests saved without contact details readable", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      requests: [
        {
          _id: "old-request",
          requestType: "NEW_GYM",
          status: "PENDING",
          submittedAt: "2026-10-12T13:15:00.000Z",
          reviewedAt: null,
          contact: {},
          gym: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    const { requests } = await listGymRequests({
      status: "PENDING",
      requestType: "",
      page: 1,
    });
    expect(requests[0].contact).toEqual({
      firstName: "",
      lastName: "",
      email: "",
    });
    expect(requests[0].gym).toBeNull();
  });

  it("loads one request by its encoded ID and maps the gym and reviewer IDs", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue(serverDetails);

    const result = await getGymRequest("request/1", signal);

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/admin/gym-requests/request%2F1",
      {
        headers: auth,
        signal,
      },
    );
    expect(result.requestId).toBe("request-1");
    expect(result.contact).toEqual({
      firstName: "Eli",
      lastName: "Moreau",
      email: "eli@hogtown.ca",
      phone: "416-555-0101",
      jobTitle: null,
    });
    expect(result.gym).toEqual({
      gymId: "gym-1",
      name: "Hogtown Boulders",
      location: "1 Bathurst St, Toronto",
      status: "ACTIVE",
    });
    expect(result.review?.reviewedBy).toEqual({
      userId: "admin-1",
      firstName: "Ada",
      lastName: "Admin",
      email: "admin@topsend.test",
    });
    expect(result.accountSetup?.linkExpiresAt).toBe("2026-10-28T14:00:00.000Z");
  });

  it("sends an approval as a PATCH with no reason, and returns the saved request", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      message: "Request approved.",
      request: serverDetails,
      emailSent: true,
    });

    const result = await reviewGymRequest("request-1", { decision: "APPROVE" });

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/admin/gym-requests/request-1/review",
      {
        method: "PATCH",
        body: { decision: "APPROVE" },
        headers: auth,
        signal: undefined,
      },
    );
    expect(result.message).toBe("Request approved.");
    expect(result.emailSent).toBe(true);
    expect(result.request.status).toBe("APPROVED");
  });

  it("sends a rejection with its reason, and without one when it's left blank", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      message: "Request rejected.",
      request: { ...serverDetails, status: "REJECTED", accountSetup: null },
      emailSent: true,
    });

    await reviewGymRequest("request-1", {
      decision: "REJECT",
      reason: "We couldn't verify the gym.",
    });
    await reviewGymRequest("request-1", { decision: "REJECT", reason: "" });

    expect(
      vi.mocked(apiRequest).mock.calls.map(([, options]) => options?.body),
    ).toEqual([
      { decision: "REJECT", reason: "We couldn't verify the gym." },
      { decision: "REJECT" },
    ]);
  });

  it("passes a refused decision on without sending it again", async () => {
    const refused = new ApiError(
      409,
      "GYM_REQUEST_ALREADY_REVIEWED",
      "This request was already approved. Only pending requests can be approved or rejected.",
    );
    vi.mocked(apiRequest).mockRejectedValue(refused);

    await expect(
      reviewGymRequest("request-1", { decision: "APPROVE" }),
    ).rejects.toBe(refused);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
