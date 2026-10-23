import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient.ts";
import { checkSetupLink, completeGymAdminSetup } from "./gymAdminSetupApi.ts";

function apiAnswers(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof apiAnswers>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  return { url, method: init.method, body: JSON.parse(String(init.body)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gym Administrator account setup calls", () => {
  it("checks a setup link and returns whose account it sets up", async () => {
    const link = {
      firstName: "Avery",
      lastName: "Chen",
      email: "avery@example.com",
      gym: { name: "Boulderhaus Leslieville", location: "1 Leslie St, Toronto" },
    };
    const fetchMock = apiAnswers(link);

    await expect(checkSetupLink("token-from-email")).resolves.toEqual(link);
    expect(sent(fetchMock)).toEqual({
      url: "/api/gym-requests/setup/check",
      method: "POST",
      body: { token: "token-from-email" },
    });
  });

  it("sends the password with the token and returns the new account", async () => {
    const result = {
      status: "ACCOUNT_CREATED",
      message: "Your Gym Administrator account is ready. Log in with your email and new password.",
      user: { email: "avery@example.com", firstName: "Avery", lastName: "Chen", role: "GYM_ADMIN" },
      gym: { name: "Boulderhaus Leslieville", location: "1 Leslie St, Toronto" },
    };
    const fetchMock = apiAnswers(result, 201);

    await expect(
      completeGymAdminSetup("token-from-email", "Crimp hard 2 the top"),
    ).resolves.toEqual(result);
    expect(sent(fetchMock)).toEqual({
      url: "/api/gym-requests/setup",
      method: "POST",
      body: { token: "token-from-email", password: "Crimp hard 2 the top" },
    });
  });

  it("passes on the API's error for a link that doesn't work", async () => {
    apiAnswers(
      {
        error: "SETUP_LINK_INVALID",
        message: "This setup link has expired or was already used. Contact TopSend to get a new one.",
      },
      400,
    );

    const error = await checkSetupLink("used-token").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("SETUP_LINK_INVALID");
  });
});
