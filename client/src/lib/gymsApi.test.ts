import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./apiClient.ts";
import { createGym, listGyms, getGym, updateGym, deactivateGym } from "./gymsApi.ts";
import { ApiError } from "./apiClient.ts";
vi.mock("./apiClient.ts", async importOriginal => ({ ...await importOriginal<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
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

describe("US-005 details adapter", () => {
  const serverGym = {
    _id: "gym-id", name: "Summit", location: "Toronto", status: "ACTIVE",
    adminIds: [{ _id: "admin-id", firstName: "Alex", lastName: "Lee", email: "alex@example.com", passwordHash: "not-for-the-ui" }],
  };
  it("maps populated administrators and keeps only their display fields", async () => {
    vi.mocked(apiRequest).mockResolvedValue(serverGym);
    expect((await getGym("gym-id")).administrators).toEqual([
      { userId: "admin-id", firstName: "Alex", lastName: "Lee", email: "alex@example.com" },
    ]);
  });
  it("shows an actual empty assignment list", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...serverGym, adminIds: [] });
    expect((await getGym("gym-id")).administrators).toEqual([]);
  });
  it("PATCHes only allowed fields to the selected encoded ID", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...serverGym, name: "Updated" });
    const signal = new AbortController().signal;
    const input = { name: "Updated", status: "INACTIVE", adminIds: ["other-user"] };
    const result = await updateGym("selected/id", input, signal);
    expect(result.name).toBe("Updated");
    expect(result.administrators[0].userId).toBe("admin-id");
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gyms/selected%2Fid", {
      method: "PATCH", body: { name: "Updated" }, headers: { Authorization: "Bearer test-token" }, signal,
    });
  });
  it("uses the dedicated authenticated deactivation endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...serverGym, status: "INACTIVE" });
    const signal = new AbortController().signal;
    const result = await deactivateGym("gym-id", signal);
    expect(result.status).toBe("INACTIVE");
    expect(result.administrators).toHaveLength(1);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/gyms/gym-id/deactivate", {
      method: "PATCH", headers: { Authorization: "Bearer test-token" }, signal,
    });
  });
  it("propagates write failures instead of silently repeating a write", async () => {
    const error = new ApiError(409, "GYM_EXISTS", "Already exists.");
    vi.mocked(apiRequest).mockRejectedValue(error);
    await expect(updateGym("gym-id", { location: "Toronto" })).rejects.toBe(error);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
