import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { checkedDisplay, displayGateway, displayReference, getPublicDisplay } from "./displaySettingsApi.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
const body = { competitionId: "selected", displaySettings: { logo: "https://example.com/logo.png", background: null, sponsors: ["/assets/sponsor.png"] } };
const signal = new AbortController().signal;
it("reads and normalizes the selected competition response", async () => {
  vi.mocked(apiRequest).mockResolvedValue(body);
  expect((await displayGateway.load("selected", signal)).settings.sponsors[0].reference).toBe("/assets/sponsor.png");
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gym-admin/competitions/selected/display-settings", { signal, headers: { Authorization: "Bearer test-token" } });
});
it("PUTs a complete replacement of references, not preview objects or files", async () => {
  vi.mocked(apiRequest).mockResolvedValue(body);
  const draft = checkedDisplay(body, "selected").settings;
  await displayGateway.save("selected", draft, signal);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gym-admin/competitions/selected/display-settings", { method: "PUT", signal, body: body.displaySettings, headers: { Authorization: "Bearer test-token" } });
});
it("uses the published competition settings endpoint without a login token", async () => {
  vi.mocked(apiRequest).mockResolvedValue(body); await getPublicDisplay("selected", signal);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/competitions/selected/display-settings", { signal });
});
it.each(["blob:temporary", "data:image/png;base64,a", "javascript:alert(1)", "https://name:password@example.com/image", "x".repeat(2049)])("refuses an unsavable or unsafe image reference: %s", reference => { expect(() => displayReference(reference)).toThrow(); });
it("rejects mismatched competition data", () => { expect(() => checkedDisplay(body, "other")).toThrow(); });
it("propagates refused saves without retrying", async () => {
  const error = new ApiError(403,"FORBIDDEN","denied"); vi.mocked(apiRequest).mockRejectedValue(error);
  await expect(displayGateway.save("selected", checkedDisplay(body,"selected").settings, signal)).rejects.toBe(error); expect(apiRequest).toHaveBeenCalledTimes(1);
});
