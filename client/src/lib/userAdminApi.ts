import { ApiError, apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";
import type { Role } from "../constants/roles.ts";

/** US-008 -> FR-003 -> AC-006. All three reads require the ADMIN session. */
export interface UserGym { _id: string; name: string; status: string }
export interface UserSummary {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  roleLabel: string;
  isActive: boolean;
  createdAt: string;
  gyms: UserGym[];
}
export interface UserPage { users: UserSummary[]; total: number; page: number; limit: number }
export interface UserFilterOptions {
  roles: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
  sorts: { value: string; label: string }[];
  gyms: UserGym[];
}
export interface UserFilters { q: string; role: string; status: string; gymId: string; sort: string; page: number; limit: number }
export interface UserDetails extends Omit<UserSummary, "gyms"> {
  phone: string | null;
  updatedAt: string;
  climber: {
    dateOfBirth: string | null; gender: string | null; address: string | null;
    postalCode: string | null; country: string | null; hasSavedLocation: boolean;
    termsVersion: string | null; termsAcceptedAt: string | null; registrationCount: number;
  } | null;
  gymAdmin: { gyms: UserGym[] } | null;
}
export const DEFAULT_USER_FILTERS: UserFilters = { q: "", role: "", status: "all", gymId: "", sort: "name", page: 1, limit: 20 };
export const USER_SEARCH_MAX_LENGTH = 100;

/** Filters stay in the address while an account is opened and on browser Back/Forward. */
export function readUserFilters(params: URLSearchParams): UserFilters {
  const positive = (value: string | null, fallback: number) => value !== null && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
  return {
    q: params.get("q") ?? "", role: (params.get("role") ?? "").trim().toUpperCase(),
    status: (params.get("status") ?? "").trim().toLowerCase() || "all",
    gymId: (params.get("gymId") ?? "").trim().toLowerCase(), sort: (params.get("sort") ?? "").trim().toLowerCase() || "name",
    page: positive(params.get("page"), 1), limit: Math.min(100, positive(params.get("limit"), 20)),
  };
}
export function userSearchParams(filters: UserFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.role) params.set("role", filters.role);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.gymId) params.set("gymId", filters.gymId);
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit !== 20) params.set("limit", String(filters.limit));
  return params;
}
function read<T>(path: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<T>(path, { headers: { Authorization: "Bearer " + token }, signal }));
}
export async function listAdminUsers(filters: UserFilters, signal?: AbortSignal): Promise<UserPage> {
  const params = userSearchParams(filters);
  const result = await read<UserPage>("/api/admin/users" + (params.size ? "?" + params : ""), signal);
  if (!result || !Array.isArray(result.users) || !Number.isSafeInteger(result.total) || result.total < 0 ||
    result.page !== filters.page || result.limit !== filters.limit ||
    result.users.some(user => !user || typeof user._id !== "string" || !user._id || typeof user.email !== "string" || !Array.isArray(user.gyms))) {
    throw new Error("The user list response was incomplete.");
  }
  return result;
}
export async function getUserFilterOptions(signal?: AbortSignal): Promise<UserFilterOptions> {
  const result = await read<UserFilterOptions>("/api/admin/users/filters", signal);
  const choices = (value: unknown) => Array.isArray(value) && value.every(item => item && typeof item.value === "string" && typeof item.label === "string");
  if (!result || !choices(result.roles) || !choices(result.statuses) || !choices(result.sorts) || !Array.isArray(result.gyms)) {
    throw new Error("User filter choices are unavailable.");
  }
  return result;
}
export async function getAdminUser(id: string, signal?: AbortSignal): Promise<UserDetails> {
  const result = await read<UserDetails>("/api/admin/users/" + encodeURIComponent(id), signal);
  if (!result || typeof result._id !== "string" || result._id.toLowerCase() !== id.toLowerCase() || typeof result.email !== "string") {
    throw new Error("The account response did not match the selected user.");
  }
  return result;
}
export const userName = (user: Pick<UserSummary, "firstName" | "lastName" | "email">) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
export const userAccountStatus = (active: boolean) => active === true ? "Active" : active === false ? "Deactivated" : "Status unavailable";
export function userAdminProblem(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : fallback;
}
