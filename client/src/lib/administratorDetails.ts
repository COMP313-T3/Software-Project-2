import type { GymAdministratorDetails, Gym } from "./gymsApi.ts";
import { ApiError } from "./apiClient.ts";
import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export type AdministratorField = "firstName" | "lastName" | "email" | "phone";
export type AdministratorChanges = Partial<Pick<GymAdministratorDetails, AdministratorField>>;

/** The UI uses authoritative snapshots returned by the US007 account endpoints. */
export interface AdministratorGateway {
  get: (gymId: string, userId: string, signal: AbortSignal) => Promise<GymAdministratorDetails>;
  editableFields?: readonly AdministratorField[];
  update?: (userId: string, changes: AdministratorChanges, signal: AbortSignal) => Promise<GymAdministratorDetails>;
  removeGym?: (userId: string, gymId: string, signal: AbortSignal) => Promise<GymAdministratorDetails>;
  deactivate?: (userId: string, signal: AbortSignal) => Promise<GymAdministratorDetails>;
}

type ServerAccount = Omit<GymAdministratorDetails, "userId" | "gyms"> & {
  _id: string; gyms: (Omit<Gym, "gymId"> & { _id: string })[];
};
function normalize(account: ServerAccount): GymAdministratorDetails {
  if (!account._id || account.role !== "GYM_ADMIN" || !Array.isArray(account.gyms)) throw new Error("Invalid administrator response");
  return {
    userId: account._id, firstName: account.firstName, lastName: account.lastName,
    email: account.email, phone: account.phone ?? null, role: account.role,
    isActive: account.isActive, createdAt: account.createdAt,
    gyms: account.gyms.map(gym => ({ gymId: gym._id, name: gym.name, location: gym.location, status: gym.status })),
  };
}
const accountPath = (id: string) => `/api/admin/gym-admins/${encodeURIComponent(id)}`;
function request<T>(path: string, signal: AbortSignal, method: "GET" | "PATCH" | "DELETE" = "GET", body?: unknown) {
  return withAccessToken(token => apiRequest<T>(path, { method, signal, ...(body === undefined ? {} : { body }), headers: { Authorization: `Bearer ${token}` } }));
}
export const administratorGateway: AdministratorGateway = {
  editableFields: ["firstName", "lastName", "email", "phone"],
  // Account-scoped reads remain available after removal from the originating gym.
  get: async (_gymId, userId, signal) => normalize(await request<ServerAccount>(accountPath(userId), signal)),
  update: async (userId, changes, signal) => {
    const body: AdministratorChanges = {};
    for (const field of ["firstName", "lastName", "email", "phone"] as const) {
      if (changes[field] !== undefined) Object.assign(body, { [field]: changes[field] });
    }
    return normalize(await request<ServerAccount>(accountPath(userId), signal, "PATCH", body));
  },
  removeGym: async (userId, gymId, signal) => normalize((await request<{ account: ServerAccount }>(`${accountPath(userId)}/gyms/${encodeURIComponent(gymId)}`, signal, "DELETE")).account),
  deactivate: async (userId, signal) => normalize((await request<{ account: ServerAccount }>(`${accountPath(userId)}/deactivate`, signal, "PATCH")).account),
};

export const ADMINISTRATOR_LABELS: Record<AdministratorField, string> = {
  firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone (optional)",
};

export function administratorProblem(error: unknown, writing = false): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has ended. Sign in again to continue.";
    if (error.status === 403) return "You no longer have permission to manage this account.";
    if (error.status === 404) return "This administrator or gym is no longer available.";
    if (error.code === "EMAIL_TAKEN") return "This email already belongs to another TopSend account.";
    if (error.code === "LAST_GYM_ADMIN") return "This is the gym's only active administrator and it has upcoming competitions. Assign another administrator first, or deactivate the gym.";
    if (error.status === 409) return "The account changed or this action is no longer allowed. Refresh the details before trying again.";
    if (error.status === 400) return "Check the highlighted fields and try again.";
    if (error.status === 429) return "Too many requests. Please wait and try again.";
  }
  return writing
    ? "We couldn't confirm the change. Refresh the account details before trying another action."
    : "Couldn't load this administrator. Please try again.";
}

/** Validate only explicitly enabled fields, and send only fields that actually changed. */
export function administratorChanges(
  current: GymAdministratorDetails,
  draft: Partial<Record<AdministratorField, string>>,
  fields: readonly AdministratorField[],
): { changes: AdministratorChanges; errors: Partial<Record<AdministratorField, string>> } {
  const errors: Partial<Record<AdministratorField, string>> = {};
  const changes: AdministratorChanges = {};
  for (const field of fields) {
    const value = (draft[field] ?? "").trim();
    if (field === "phone") {
      if (value && (value.length > 30 || !/^\+?[\d\s().-]+$/.test(value) || value.replace(/\D/g, "").length < 7 || value.replace(/\D/g, "").length > 15)) errors.phone = "Enter a valid phone number with 7 to 15 digits.";
      if (value !== (current.phone ?? "")) changes.phone = value || null;
      continue;
    }
    if (!value) errors[field] = `Enter the ${ADMINISTRATOR_LABELS[field].toLowerCase()}.`;
    else if (value.length > (field === "email" ? 254 : 50)) errors[field] = `Use ${field === "email" ? 254 : 50} characters or fewer.`;
    else if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.email = "Enter a valid email address.";
    if (value !== current[field]) changes[field] = value;
  }
  return { changes, errors };
}
