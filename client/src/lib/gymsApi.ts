import { apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export type GymStatus = "ACTIVE" | "PENDING" | "INACTIVE";
export interface Gym { gymId: string; name: string; location: string; status: GymStatus }
export interface NewGym { name: string; location: string; status: GymStatus }
export interface GymPage { gyms: Gym[]; total: number; page: number; limit: number }
type ServerGym = Omit<Gym, "gymId"> & { _id?: string; gymId?: string };

/** Normalizes Joseph's MongoDB _id for UI links. If the agreed contract changes,
 * update this adapter rather than the page. Used by listGyms, createGym and getGym below. */
function normalizeGym(gym: ServerGym): Gym {
  const gymId = gym.gymId ?? gym._id;
  if (!gymId) throw new Error("The server returned a gym without an ID.");
  return { gymId, name: gym.name, location: gym.location, status: gym.status };
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
 * Uses the existing login token; never writes or changes the selected gym. */
export async function getGym(gymId: string, signal?: AbortSignal): Promise<Gym> {
  const result = await withAccessToken(token => apiRequest<ServerGym>(
    `/api/gyms/${encodeURIComponent(gymId)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  ));
  return normalizeGym(result);
}
