import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as OnboardingApi from "./onboardingApi.ts";
import { startSession } from "./sessionClient.ts";
import * as sessionApi from "./sessionApi.ts";

const { getOnboarding, markOnboardingSeen, readOnboarding } =
  await vi.importActual<typeof OnboardingApi>("./onboardingApi.ts");

const fetchMock = vi.fn<typeof fetch>();
const SEEN_AT = "2026-11-09T15:00:00.000Z";

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(sessionApi.logIn).mockResolvedValue({
    userId: "climber-one",
    role: "CLIMBER",
    token: "onboarding-token",
    expiresAt: "2040-01-01T00:00:00Z",
  });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({
    userId: "climber-one",
    email: "climber@example.com",
    role: "CLIMBER",
    session: { expiresIn: 3600, limitReached: false },
  });
  await startSession("climber@example.com", "fixture-password");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("US-037 the onboarding API", () => {
  it("asks whether the logged-in user has seen the tutorial, with their access token", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ seen: false, seenAt: null }));

    expect(await getOnboarding()).toEqual({ seen: false, seenAt: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/me/onboarding",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json", Authorization: "Bearer onboarding-token" },
      }),
    );
  });

  it("records that it was seen with seen set to true and nothing else", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ seen: true, seenAt: SEEN_AT }));

    expect(await markOnboardingSeen()).toEqual({ seen: true, seenAt: SEEN_AT });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/users/me/onboarding");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ seen: true });
  });

  it.each([null, {}, { seen: "false" }, { seen: 1 }, []])(
    "treats an answer that doesn't say whether it was seen as an error: %j",
    (body) => {
      expect(() => readOnboarding(body)).toThrow();
    },
  );

  it("keeps the time only for a seen tutorial", () => {
    expect(readOnboarding({ seen: false, seenAt: SEEN_AT })).toEqual({ seen: false, seenAt: null });
    expect(readOnboarding({ seen: true, seenAt: 42 })).toEqual({ seen: true, seenAt: null });
  });
});
