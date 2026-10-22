import { apiRequest } from "./apiClient.ts";
import type { LatLngLiteral } from "./googleMaps.ts";
import { withAccessToken } from "./sessionClient.ts";

export type GymStatus = "ACTIVE" | "PENDING" | "INACTIVE";
/** coordinates is the gym's map pin, null without one, and absent when an answer leaves it out. */
export interface Gym { gymId: string; name: string; location: string; status: GymStatus; coordinates?: LatLngLiteral | null }
export interface GymAdministrator { userId: string; firstName: string; lastName: string; email: string }
export interface GymDetails extends Gym { administrators: GymAdministrator[] }
/** coordinates null removes the gym's map pin. */
export interface GymUpdate { name?: string; location?: string; coordinates?: LatLngLiteral | null }
export interface NewGym { name: string; location: string; status: GymStatus; coordinates?: LatLngLiteral }
export interface GymPage { gyms: Gym[]; total: number; page: number; limit: number }
export interface GymAdministratorDetails extends GymAdministrator {
  role: string;
  isActive: boolean;
  createdAt?: string;
  gyms: Gym[];
}
type ServerGym = Omit<Gym, "gymId"> & { _id?: string; gymId?: string };
type ServerAdministrator = Omit<GymAdministrator, "userId"> & { _id?: string; userId?: string };
type ServerGymDetails = ServerGym & { adminIds?: ServerAdministrator[] };
type ServerAdministratorDetails = ServerAdministrator & {
  role: string;
  isActive: boolean;
  createdAt?: string;
  gyms?: ServerGym[];
};

/** Turns a gym from the API, which names its ID _id, into the shape the pages use. */
function normalizeGym(gym: ServerGym): Gym {
  const gymId = gym.gymId ?? gym._id;
  if (!gymId) throw new Error("The server returned a gym without an ID.");
  return {
    gymId, name: gym.name, location: gym.location, status: gym.status,
    ...(gym.coordinates !== undefined ? { coordinates: gym.coordinates } : {}),
  };
}

function normalizeAdministrator(admin: ServerAdministrator): GymAdministrator {
  const userId = admin.userId ?? admin._id;
  if (!userId) throw new Error("The server returned an administrator without an ID.");
  return { userId, firstName: admin.firstName, lastName: admin.lastName, email: admin.email };
}

/** Details responses populate adminIds; directory responses contain plain IDs. */
function normalizeGymDetails(gym: ServerGymDetails): GymDetails {
  return { ...normalizeGym(gym), administrators: (gym.adminIds ?? []).map(normalizeAdministrator) };
}

/** Loads one page of registered gyms, optionally only those with one status (US-004). */
export async function listGyms(page = 1, status = "", signal?: AbortSignal): Promise<GymPage> {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) query.set("status", status);
  const result = await withAccessToken(token => apiRequest<Omit<GymPage, "gyms"> & { gyms: ServerGym[] }>(`/api/gyms?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
  return { ...result, gyms: result.gyms.map(normalizeGym) };
}

/** Registers a gym (US-004). The request is never retried, so a gym can't be added twice. */
export async function createGym(input: NewGym): Promise<Gym> {
  const result = await withAccessToken(token => apiRequest<ServerGym>("/api/gyms", {
    method: "POST", body: input, headers: { Authorization: `Bearer ${token}` },
  }));
  return normalizeGym(result);
}

/** Loads one gym with its assigned Gym Administrators (US-005). */
export async function getGym(gymId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** Saves one gym's name, location or map pin (US-005). Only the fields given are sent. */
export async function updateGym(gymId: string, input: GymUpdate, signal?: AbortSignal): Promise<GymDetails> {
  const body: GymUpdate = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.location !== undefined) body.location = input.location;
  if (input.coordinates !== undefined) body.coordinates = input.coordinates;
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}`,
    { method: "PATCH", body, headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** Marks a gym INACTIVE, keeping its record and administrator assignments (US-005). */
export async function deactivateGym(gymId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}/deactivate`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** Assigns a Gym Administrator to a gym (US-006). The server checks that the account is active
 * and approved for this gym. */
export async function assignGymAdmin(gymId: string, userId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}/admins/${encodeURIComponent(userId)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** Removes one Gym Administrator from a gym (US-006). The account and its other gyms are kept. */
export async function removeGymAdmin(gymId: string, userId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}/admins/${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** Marks a PENDING or INACTIVE gym ACTIVE, keeping its record and assignments (US-005). */
export async function activateGym(gymId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}/activate`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** The active Gym Administrator accounts approved for a gym and not assigned to it yet (US-006). */
export async function listAdminCandidates(gymId: string, signal?: AbortSignal): Promise<GymAdministrator[]> {
  const result = await withAccessToken(token => apiRequest<{ candidates: ServerAdministrator[] }>(
    `/api/gyms/${encodeURIComponent(gymId)}/admin-candidates`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return result.candidates.map(normalizeAdministrator);
}

/** One of a gym's Gym Administrators, with every gym they administer (US-006). */
export async function getGymAdmin(gymId: string, userId: string, signal?: AbortSignal): Promise<GymAdministratorDetails> {
  const result = await withAccessToken(token => apiRequest<ServerAdministratorDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}/admins/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return {
    ...normalizeAdministrator(result),
    role: result.role,
    isActive: result.isActive,
    createdAt: result.createdAt,
    gyms: (result.gyms ?? []).map(normalizeGym),
  };
}
