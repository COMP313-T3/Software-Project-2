import { describe, expect, it } from "vitest";
import { canDeactivateUser, prepareUserChanges, profileDraft } from "./userAccountForm.ts";
import type { UserDetails } from "./userAdminApi.ts";
const account: UserDetails = { _id: "account", firstName: "Cara", lastName: "Lee", email: "cara@example.com", phone: "4165550101", role: "CLIMBER", roleLabel: "Climber", isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01", climber: { dateOfBirth: "2000-02-20", gender: "FEMALE", address: "1 Test Street", country: "CA", postalCode: "M5V 2T6", hasSavedLocation: true, registrationCount: 0, termsVersion: "v1", termsAcceptedAt: "2026-01-01" }, gymAdmin: null };
describe("US-009 permitted account changes", () => {
  it("sends only trimmed, changed fields, leaving profile/location/registration data untouched", () => {
    const draft = { ...profileDraft(account), firstName: " Jordan ", email: " CARA@example.com " };
    expect(prepareUserChanges(account, draft)).toEqual({ changes: { firstName: "Jordan" }, errors: {} });
  });
  it("recognizes an unchanged form", () => expect(prepareUserChanges(account, profileDraft(account)).changes).toEqual({}));
  it.each([
    ["firstName", " ", "firstName"], ["lastName", "x".repeat(51), "lastName"], ["email", "not-email", "email"],
    ["phone", "letters", "phone"], ["phone", "", "phone"], ["dateOfBirth", "2005-02-30", "dateOfBirth"],
    ["dateOfBirth", "9999-01-01", "dateOfBirth"], ["gender", "OTHER", "gender"], ["address", "", "address"],
    ["country", "XX", "country"], ["postalCode", "bad", "postalCode"],
  ])("rejects changed invalid %s (%s)", (field, value, expected) => {
    expect(prepareUserChanges(account, { ...profileDraft(account), [field]: value }).errors).toHaveProperty(expected);
  });
  it("checks a retained postal code when the country changes", () => {
    expect(prepareUserChanges(account, { ...profileDraft(account), country: "US" }).errors.postalCode).toBeTruthy();
    expect(prepareUserChanges(account, { ...profileDraft(account), country: "us", postalCode: "10001" })).toEqual({ changes: { country: "US", postalCode: "10001" }, errors: {} });
  });
  it("only clears the saved pin when explicitly selected", () => {
    expect(prepareUserChanges(account, { ...profileDraft(account), clearLocation: true }).changes).toEqual({ location: null });
  });
  it("does not invent Climber profile changes for a different role", () => {
    const admin = { ...account, role: "ADMIN" as const, climber: null };
    expect(prepareUserChanges(admin, { ...profileDraft(admin), address: "Other", country: "US", clearLocation: true, firstName: "Jordan" })).toEqual({ changes: { firstName: "Jordan" }, errors: {} });
  });
  it("allows deactivation only for active Climber/Gym Admin accounts other than the actor", () => {
    expect(canDeactivateUser(account, "actor")).toBe(true);
    expect(canDeactivateUser({ ...account, role: "GYM_ADMIN" }, "actor")).toBe(true);
    expect(canDeactivateUser({ ...account, role: "ADMIN" }, "actor")).toBe(false);
    expect(canDeactivateUser({ ...account, isActive: false }, "actor")).toBe(false);
    expect(canDeactivateUser(account, "ACCOUNT")).toBe(false);
  });
});
