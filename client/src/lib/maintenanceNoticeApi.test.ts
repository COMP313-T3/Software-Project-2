import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "./apiClient.ts";

vi.mock("./apiClient.ts", async (original) => ({
  ...(await original<typeof import("./apiClient.ts")>()),
  apiRequest: vi.fn(async () => ({ maintenanceMode: true, maintenanceMessage: "Back at 1:00 a.m." })),
}));
vi.mock("./sessionClient.ts", async (original) => ({
  ...(await original<typeof import("./sessionClient.ts")>()),
  withAccessToken: vi.fn(async (send: (token: string) => Promise<unknown>) => send("token-for-tests")),
}));

describe("US-010 reading the maintenance notice", () => {
  it("asks the API with the access token", async () => {
    const { getMaintenanceNotice } = await vi.importActual<typeof import("./maintenanceNoticeApi.ts")>("./maintenanceNoticeApi.ts");
    const signal = new AbortController().signal;

    expect(await getMaintenanceNotice(signal)).toEqual({ maintenanceMode: true, maintenanceMessage: "Back at 1:00 a.m." });
    expect(apiRequest).toHaveBeenCalledWith("/api/session/notice", { headers: { Authorization: "Bearer token-for-tests" }, signal });
  });
});
