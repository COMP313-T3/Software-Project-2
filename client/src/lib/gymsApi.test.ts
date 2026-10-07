import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./apiClient.ts";
import { createGym, listGyms, getGym } from "./gymsApi.ts";
vi.mock("./apiClient.ts", () => ({ apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
beforeEach(() => vi.mocked(apiRequest).mockReset());
describe("Gym API adapter", () => {
  it("maps MongoDB IDs and sends authenticated filter/pagination reads", async () => {
    const gym = { _id: "abc", name: "Summit", location: "Auckland", status: "ACTIVE" };
    vi.mocked(apiRequest).mockResolvedValue({ gyms: [gym], total: 1, page: 2, limit: 20 });
    const result = await listGyms(2, "ACTIVE");
    expect(result.gyms[0].gymId).toBe("abc");
    expect(apiRequest).toHaveBeenCalledWith("/api/gyms?page=2&limit=20&status=ACTIVE", { headers: { Authorization: "Bearer test-token" }, signal: undefined });
  });
  it("sends exactly the agreed creation fields and accepts contract gymId", async () => {
    const input = { name: "Summit", location: "Auckland", status: "ACTIVE" as const };
    vi.mocked(apiRequest).mockResolvedValue({ ...input, gymId: "abc" });
    expect((await createGym(input)).gymId).toBe("abc");
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gyms", { method: "POST", body: input, headers: { Authorization: "Bearer test-token" } });
  });
});


it("reads the selected gym through the authenticated detail endpoint", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ _id: "gym-id", name: "Summit", location: "Auckland", status: "ACTIVE" });
  const signal = new AbortController().signal;
  expect((await getGym("gym-id", signal)).gymId).toBe("gym-id");
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gyms/gym-id", { headers: { Authorization: "Bearer test-token" }, signal });
});
