import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { administratorGateway as api, administratorChanges } from "./administratorDetails.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
const account = { _id: "user", firstName: "Alex", lastName: "River", email: "alex@example.com", phone: null, role: "GYM_ADMIN", isActive: true, gyms: [{ _id: "gym", name: "Summit", location: "Toronto", status: "ACTIVE" }], passwordHash: "private" };
const signal = new AbortController().signal;
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
it("uses the account-scoped authenticated read and excludes private fields", async () => {
  vi.mocked(apiRequest).mockResolvedValue(account);
  const result = await api.get("removed-gym", "user/id", signal);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/admin/gym-admins/user%2Fid", { method: "GET", signal, headers: { Authorization: "Bearer test-token" } });
  expect(result.userId).toBe("user"); expect(result.gyms[0].gymId).toBe("gym"); expect(result).not.toHaveProperty("passwordHash");
});
it("PATCHes only permitted fields and explicitly clears an optional phone", async () => {
  vi.mocked(apiRequest).mockResolvedValue(account);
  await api.update!("user", { firstName: "Jordan", phone: null, role: "ADMIN" } as never, signal);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/admin/gym-admins/user", { method: "PATCH", signal, body: { firstName: "Jordan", phone: null }, headers: { Authorization: "Bearer test-token" } });
});
it("unwraps removal and deactivation snapshots with no extra mutation body", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ message: "Changed", account: { ...account, gyms: [] } });
  expect((await api.removeGym!("user", "gym/id", signal)).gyms).toEqual([]);
  expect(apiRequest).toHaveBeenLastCalledWith("/api/admin/gym-admins/user/gyms/gym%2Fid", { method: "DELETE", signal, headers: { Authorization: "Bearer test-token" } });
  vi.mocked(apiRequest).mockResolvedValue({ account: { ...account, isActive: false } });
  expect((await api.deactivate!("user", signal)).isActive).toBe(false);
  expect(apiRequest).toHaveBeenLastCalledWith("/api/admin/gym-admins/user/deactivate", { method: "PATCH", signal, headers: { Authorization: "Bearer test-token" } });
});
it("preserves rejection and does not retry a refused mutation", async () => {
  const error = new ApiError(409, "LAST_GYM_ADMIN", "Blocked"); vi.mocked(apiRequest).mockRejectedValue(error);
  await expect(api.removeGym!("user", "gym", signal)).rejects.toBe(error); expect(apiRequest).toHaveBeenCalledTimes(1);
});
it("validates and clears phones using the backend's optional-phone rules", () => {
  const current = { ...account, userId: "user", gyms: [], phone: "+1 416 555 0100" };
  expect(administratorChanges(current, { phone: " " }, ["phone"]).changes).toEqual({ phone: null });
  expect(administratorChanges(current, { phone: "abc" }, ["phone"]).errors.phone).toBeTruthy();
  expect(administratorChanges(current, { phone: "+1 (416) 555-0101" }, ["phone"]).errors).toEqual({});
});
