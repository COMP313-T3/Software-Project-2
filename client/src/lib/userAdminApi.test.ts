import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_FILTERS, getAdminUser, getUserFilterOptions, listAdminUsers, readUserFilters, userSearchParams, userAccountStatus } from "./userAdminApi.ts";
import { startSession } from "./sessionClient.ts";
import * as sessionApi from "./sessionApi.ts";

const id = "507f1f77bcf86cd799439011";
const account = { _id: id, firstName: "Cara", lastName: "Lee", email: "cara@example.com", role: "CLIMBER", roleLabel: "Climber", isActive: true, createdAt: "2026-10-01T12:00:00Z", gyms: [] };
const page = { users: [account], total: 1, page: 1, limit: 20 };
const choices = { roles: [{ value: "CLIMBER", label: "Climber" }], statuses: [{ value: "all", label: "All accounts" }], sorts: [{ value: "name", label: "Name (A to Z)" }], gyms: [] };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(async () => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  vi.mocked(sessionApi.logIn).mockResolvedValue({ userId: "system-admin", role: "ADMIN", token: "admin-token", expiresAt: "2040-01-01T00:00:00Z" });
  vi.mocked(sessionApi.fetchCurrentUser).mockResolvedValue({ userId: "system-admin", email: "admin@example.com", role: "ADMIN", session: { expiresIn: 3600, limitReached: false } });
  await startSession("admin@example.com", "test-password");
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("US-008 / #146, #147 user search API adapter", () => {
  it("reads the user page with the ADMIN bearer session and no write or actor query", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(page));
    await expect(listAdminUsers(DEFAULT_USER_FILTERS)).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "GET", credentials: "include", headers: { Accept: "application/json", Authorization: "Bearer admin-token" }, body: undefined }));
  });
  it("sends every supported filter, search punctuation and pagination as encoded query values", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...page, page: 2, limit: 50 }));
    await listAdminUsers({ q: " Cara+Lee@example.com & [x] ", role: "GYM_ADMIN", status: "inactive", gymId: id, sort: "newest", page: 2, limit: 50 });
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Cara+Lee@example.com & [x]", role: "GYM_ADMIN", status: "inactive", gymId: id, sort: "newest", page: "2", limit: "50" });
  });
  it("gets dropdown choices from the metadata API", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(choices));
    await expect(getUserFilterOptions()).resolves.toEqual(choices);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users/filters");
  });
  it("encodes only the selected user ID in the detail GET", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...account, _id: "account/one" }));
    expect((await getAdminUser("account/one")).email).toBe(account.email);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users/account%2Fone");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
  });
  it.each([null, { ...account, _id: "other-account" }, { ...account, email: null }])("rejects an incomplete or wrong selected-account reply: %s", async value => {
    fetchMock.mockResolvedValueOnce(Response.json(value)); await expect(getAdminUser(id)).rejects.toThrow(/selected user/);
  });
  it("accepts MongoDB IDs in either case without selecting a different account", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(account)); expect((await getAdminUser(id.toUpperCase()))._id).toBe(id);
  });
  it("normalizes empty choices and role casing while preserving literal search text", () => {
    expect(readUserFilters(new URLSearchParams({ q: "Cara .*", role: " climber ", status: " ", sort: "", gymId: id.toUpperCase(), page: "2", limit: "50" }))).toEqual({ ...DEFAULT_USER_FILTERS, q: "Cara .*", role: "CLIMBER", gymId: id, page: 2, limit: 50 });
  });
  it.each(["0", "-1", "abc", "1.5", "9007199254740992"])("uses a safe page default for %s", page => {
    expect(readUserFilters(new URLSearchParams({ page })).page).toBe(1);
  });
  it("does not send unsupported URL keys or empty/default filters to the API", () => {
    const filters = readUserFilters(new URLSearchParams("q=&role=&passwordHash=true&userId=someone"));
    expect(userSearchParams(filters).toString()).toBe("");
  });
  it.each([400, 401, 403, 404, 500])("preserves a rejected list response (%s) without treating it as an empty page", async status => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "REQUEST_FAILED", message: "Request unavailable.", fields: { q: "Check search text." } }, { status }));
    await expect(listAdminUsers(DEFAULT_USER_FILTERS)).rejects.toMatchObject({ status, fields: { q: "Check search text." } }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refreshes an expired access token before repeating the read", async () => {
    vi.mocked(sessionApi.refreshSession).mockResolvedValue({ userId: "system-admin", role: "ADMIN", token: "fresh-admin-token", expiresAt: "2040-01-01T00:00:00Z" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "TOKEN_EXPIRED", message: "Refresh login." }, { status: 401 })).mockResolvedValueOnce(Response.json(page));
    await listAdminUsers(DEFAULT_USER_FILTERS); expect(sessionApi.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: "Bearer fresh-admin-token" });
  });
  it("cancels a stale list request instead of retrying or manufacturing results", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true })));
    const operation = listAdminUsers(DEFAULT_USER_FILTERS, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); controller.abort();
    await expect(operation).rejects.toMatchObject({ code: "ABORTED" }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([null, { ...page, users: null }, { ...page, total: -1 }, { ...page, page: 2 }, { ...page, limit: 100 }, { ...page, users: [null] }])("rejects malformed or mismatched page metadata: %s", async value => {
    fetchMock.mockResolvedValueOnce(Response.json(value)); await expect(listAdminUsers(DEFAULT_USER_FILTERS)).rejects.toThrow(/incomplete/);
  });
  it.each(["roles", "statuses", "sorts", "gyms"])("handles missing %s dropdown data without assuming choices", async field => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...choices, [field]: null })); await expect(getUserFilterOptions()).rejects.toThrow(/filter choices/);
  });
  it("does not mistake absent status information for an active or deactivated account", () => {
    expect(userAccountStatus(undefined as unknown as boolean)).toBe("Status unavailable");
  });
});
