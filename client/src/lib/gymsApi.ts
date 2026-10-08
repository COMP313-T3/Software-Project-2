import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export type GymStatus = "ACTIVE" | "PENDING" | "INACTIVE";
export interface Gym { gymId: string; name: string; location: string; status: GymStatus }
export interface GymAdministrator { userId: string; firstName: string; lastName: string; email: string }
export interface GymDetails extends Gym { administrators: GymAdministrator[] }
export interface GymUpdate { name?: string; location?: string }
export interface NewGym { name: string; location: string; status: GymStatus }
export interface GymPage { gyms: Gym[]; total: number; page: number; limit: number }
type ServerGym = Omit<Gym, "gymId"> & { _id?: string; gymId?: string };
type ServerGymDetails = ServerGym & {
  adminIds?: (Omit<GymAdministrator, "userId"> & { _id?: string; userId?: string })[];
};

/** Normalizes Joseph's MongoDB _id for UI links. If the agreed contract changes,
 * update this adapter rather than the page. Used by listGyms, createGym and getGym below. */
function normalizeGym(gym: ServerGym): Gym {
  const gymId = gym.gymId ?? gym._id;
  if (!gymId) throw new Error("The server returned a gym without an ID.");
  return { gymId, name: gym.name, location: gym.location, status: gym.status };
}

/** Details responses populate adminIds; directory responses contain plain IDs. */
function normalizeGymDetails(gym: ServerGymDetails): GymDetails {
  const administrators = (gym.adminIds ?? []).map(admin => {
    const userId = admin.userId ?? admin._id;
    if (!userId) throw new Error("The server returned an administrator without an ID.");
    return { userId, firstName: admin.firstName, lastName: admin.lastName, email: admin.email };
  });
  return { ...normalizeGym(gym), administrators };
}

/** Called by pages/GymsPage.tsx. Uses sessionClient.withAccessToken and apiClient.apiRequest.
 * Backend: routes/gymRoutes.js -> gymController.listGyms -> gymService.listGyms.
 * This file is the only frontend adapter for Joseph's gym response format. */
export async function listGyms(page = 1, status = "", signal?: AbortSignal): Promise<GymPage> {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) query.set("status", status);
  const result = await withAccessToken(token => apiRequest<Omit<GymPage, "gyms"> & { gyms: ServerGym[] }>(`/api/gyms?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
  return { ...result, gyms: result.gyms.map(normalizeGym) };
}

/** Called by GymsPage.handleSubmit. Backend: gymController.createGym -> gymService.createGym.
 * Sends only the existing name/location/status fields; approval requests belong to US-035.
 * apiRequest does not automatically retry this POST, avoiding duplicate writes. */
export async function createGym(input: NewGym): Promise<Gym> {
  const result = await withAccessToken(token => apiRequest<ServerGym>("/api/gyms", {
    method: "POST", body: input, headers: { Authorization: `Bearer ${token}` },
  }));
  return normalizeGym(result);
}

/** Called by pages/GymDetailsPage.tsx to read the selected gym, including on refresh.
 * Backend: routes/gymRoutes.js -> gymController.getGym -> gymService.getGymById.
 * US-005 #30/#31 also reads this gym's populated administrators. */
export async function getGym(gymId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** US-005 #30: update only the selected gym's allowed fields. The shared client
 * never automatically retries writes after a network/server failure. */
export async function updateGym(gymId: string, input: GymUpdate, signal?: AbortSignal): Promise<GymDetails> {
  const body: GymUpdate = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.location !== undefined) body.location = input.location;
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}`,
    { method: "PATCH", body, headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}

/** Richard's dedicated endpoint retains the gym record and its assignments. */
export async function deactivateGym(gymId: string, signal?: AbortSignal): Promise<GymDetails> {
  const result = await withAccessToken(token => apiRequest<ServerGymDetails>(
    `/api/gyms/${encodeURIComponent(gymId)}/deactivate`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGymDetails(result);
}
