import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

/** US-009 -> FR-003 -> AC-006. The current API permits profile changes, not role changes. */
export interface UserProfileChanges {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  postalCode?: string;
  country?: string;
  location?: null;
}
export interface AccountChangeReceipt { userId: string; isActive: boolean }
const PROFILE_FIELDS = ["firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "address", "postalCode", "country", "location"] as const;
const sameId = (actual: unknown, expected: string) => typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
const path = (id: string) => "/api/admin/users/" + encodeURIComponent(id);
function savedValue(field: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (field === "dateOfBirth") return value.slice(0, 10);
  if (field === "postalCode") return value.toUpperCase().replace(/[ -]/g, "");
  if (field === "email") return value.trim().toLowerCase();
  return value.trim();
}

/** PATCH is sent once by apiRequest; private profile/coordinate data in its response is not retained. */
export async function updateUserProfile(id: string, changes: UserProfileChanges, signal?: AbortSignal): Promise<AccountChangeReceipt> {
  const body: UserProfileChanges = {};
  for (const field of PROFILE_FIELDS) {
    if (changes[field] !== undefined) Object.assign(body, { [field]: changes[field] });
  }
  if (!Object.keys(body).length) throw new Error("No permitted account changes were supplied.");
  const result = await withAccessToken(token => apiRequest<{ _id: string; isActive: boolean } & Record<string, unknown>>(path(id), {
    method: "PATCH", body, signal, headers: { Authorization: "Bearer " + token },
  }));
  if (!result || !sameId(result._id, id) || typeof result.isActive !== "boolean" ||
    Object.entries(body).some(([field, value]) => savedValue(field, result[field]) !== savedValue(field, value))) {
    throw new Error("The save response did not confirm the selected account.");
  }
  return { userId: result._id, isActive: result.isActive };
}

export async function deactivateUserAccount(id: string, signal?: AbortSignal): Promise<AccountChangeReceipt> {
  const result = await withAccessToken(token => apiRequest<AccountChangeReceipt>(path(id) + "/deactivate", {
    method: "PATCH", signal, headers: { Authorization: "Bearer " + token },
  }));
  if (!result || !sameId(result.userId, id) || result.isActive !== false) throw new Error("The deactivation response did not confirm the selected account.");
  return { userId: result.userId, isActive: false };
}
