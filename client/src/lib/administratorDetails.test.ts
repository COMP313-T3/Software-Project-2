import { describe, expect, it } from "vitest";
import { administratorChanges, administratorProblem } from "./administratorDetails.ts";
import { ApiError } from "./apiClient.ts";
const account = { userId: "sample", firstName: "Alex", lastName: "River", email: "alex@example.com", role: "GYM_ADMIN", isActive: true, gyms: [] };
describe("US007 frontend contract boundary", () => {
  it("sends only explicitly enabled, changed fields", () => {
    expect(administratorChanges(account, { firstName: " Jordan ", lastName: "River", email: "changed@example.com" }, ["firstName", "lastName"])).toEqual({ changes: { firstName: "Jordan" }, errors: {} });
  });
  it("validates a configured field and hides server internals", () => {
    expect(administratorChanges(account, { ...account, email: "bad" }, ["email"]).errors.email).toBeTruthy();
    expect(administratorProblem(new ApiError(500, "PRIVATE", "private database stack"), true)).not.toContain("private");
  });
});
