import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { deactivateUserAccount, updateUserProfile } from "./userAccountApi.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
const id = "507f1f77bcf86cd799439011", other = "507f1f77bcf86cd799439012";
const signal = new AbortController().signal;
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
describe("US-009 authenticated selected-account writes", () => {
  it("PATCHes only supported profile fields and discards private response data", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ _id: id, firstName: "Cara", isActive: true, passwordHash: "private", location: { coordinates: [-79, 43] } });
    const result = await updateUserProfile(id, { firstName: "Cara", role: "ADMIN", permissions: ["all"], isActive: false, passwordHash: "unsafe" } as never, signal);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/admin/users/" + id, { method: "PATCH", body: { firstName: "Cara" }, signal, headers: { Authorization: "Bearer test-token" } });
    expect(result).toEqual({ userId: id, isActive: true });
  });
  it("supports a deliberate map-pin removal and encodes the target path", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ _id: "user/id", isActive: true, location: null });
    await updateUserProfile("user/id", { location: null });
    expect(apiRequest).toHaveBeenCalledWith("/api/admin/users/user%2Fid", expect.objectContaining({ body: { location: null } }));
  });
  it("does not send an empty or unsupported update", async () => {
    await expect(updateUserProfile(id, { role: "ADMIN" } as never)).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each([null, { _id: other, isActive: true }, { _id: id }, { _id: id, isActive: "true" }, { _id: id, isActive: true, firstName: "Another" }])("refuses an unconfirmed profile response %#", async response => {
    vi.mocked(apiRequest).mockResolvedValue(response);
    await expect(updateUserProfile(id, { firstName: "Cara" })).rejects.toThrow("did not confirm");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it("accepts server-normalized postal codes and ISO birth dates", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ _id: id, isActive: true, postalCode: "M5V 2T6", dateOfBirth: "2000-02-20T00:00:00.000Z" });
    await expect(updateUserProfile(id, { postalCode: "m5v2t6", dateOfBirth: "2000-02-20" })).resolves.toEqual({ userId: id, isActive: true });
  });
  it("deactivates only the selected account with no extra body", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ userId: id, isActive: false });
    await expect(deactivateUserAccount(id, signal)).resolves.toEqual({ userId: id, isActive: false });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/api/admin/users/" + id + "/deactivate", { method: "PATCH", signal, headers: { Authorization: "Bearer test-token" } });
  });
  it.each([null, { userId: other, isActive: false }, { userId: id, isActive: true }])("refuses an unconfirmed deactivation response %#", async response => {
    vi.mocked(apiRequest).mockResolvedValue(response);
    await expect(deactivateUserAccount(id)).rejects.toThrow("did not confirm");
  });
  it.each([400, 401, 403, 404, 409, 429, 500, 0])("preserves API errors without automatically repeating a mutation (%s)", async status => {
    const error = new ApiError(status, "REJECTED", "Rejected"); vi.mocked(apiRequest).mockRejectedValue(error);
    await expect(updateUserProfile(id, { firstName: "Cara" })).rejects.toBe(error);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
