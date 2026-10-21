import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient.ts";
import { findRequestGyms, gymRequestProblem, submitGymRequest, type GymRequestInput } from "./gymRequestApi.ts";

const input: GymRequestInput = { requestType: "NEW_GYM", firstName: "Alex", lastName: "River", email: "alex@example.com", phone: "4165550100", jobTitle: "", details: "", gymName: "Boulder Gym", gymLocation: "Toronto", recaptchaToken: "test", website: "" };
afterEach(() => vi.unstubAllGlobals());
describe("US034 public API adapter", () => {
  it("uses the public lookup and encodes literal search without an authorization header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ gyms: [] }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); await findRequestGyms(" Gym & Co ", controller.signal);
    expect(fetcher.mock.calls[0][0]).toBe("/api/gym-requests/gyms?q=Gym+%26+Co"); expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it("sends the application once and accepts a pending confirmation", async () => {
    const answer = { requestId: "request", requestType: "NEW_GYM", status: "PENDING", gym: { name: "Boulder Gym" }, contact: { email: "alex@example.com" } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer), { status: 201 })); vi.stubGlobal("fetch", fetcher);
    expect(await submitGymRequest(input)).toEqual(answer); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/gym-requests"); expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it.each([{}, { requestId: "r", status: "APPROVED" }, { requestId: "r", status: "PENDING", requestType: "EXISTING_GYM", gym: { name: "Other" }, contact: { email: "x@example.com" } }])("rejects incomplete or non-pending success response: %j", async answer => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(answer), { status: 201 })));
    await expect(submitGymRequest(input)).rejects.toMatchObject({ code: "INVALID_CONFIRMATION" });
  });
  it("does not retry rejected POSTs and preserves field feedback", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "GYM_EXISTS", fields: { gymName: "Already registered" } }), { status: 409 })); vi.stubGlobal("fetch", fetcher);
    await expect(submitGymRequest(input)).rejects.toMatchObject({ status: 409, fields: { gymName: "Already registered" } }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never exposes technical error text", () => {
    expect(gymRequestProblem(new ApiError(500, "INTERNAL", "private database secret"))).not.toContain("secret");
    expect(gymRequestProblem(new ApiError(429, "RATE_LIMITED", "limit"))).toContain("wait");
  });
});
