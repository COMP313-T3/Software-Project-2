import { ApiError, apiRequest } from "./apiClient.ts";
import { withAccessToken } from "./sessionClient.ts";

export interface MyEvent {
  competition: { _id: string; name: string; date: string; location: string; gym: { _id: string; name: string } | null; status: "DRAFT" | "PUBLISHED" | "CANCELLED"; registrationStatus: "OPEN" | "CLOSED" };
  registration: { registrationId: string; status: "CONFIRMED" | "WAITLIST" | "PENDING"; registeredAt: string; division: { _id: string; name: string } | null };
}
const id = (value: unknown) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
function named(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return id(item._id) && text(item.name);
}
/** US030 -> FR009 / AC013: identity comes only from the authenticated session. */
export async function getMyEvents(signal?: AbortSignal): Promise<MyEvent[]> {
  const value = await withAccessToken(token => apiRequest<{ events: MyEvent[] }>("/api/competitions/my-events", {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
  if (!value || !Array.isArray(value.events)) throw new Error("Invalid event list");
  const seen = new Set<string>();
  for (const item of value.events) {
    const event = item?.competition, registration = item?.registration;
    if (!event || !registration || !named(event) || typeof event.location !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !Number.isFinite(Date.parse(event.date))
      || new Date(event.date).toISOString().slice(0, 10) !== event.date
      || !["DRAFT", "PUBLISHED", "CANCELLED"].includes(event.status)
      || !["OPEN", "CLOSED"].includes(event.registrationStatus)
      || (event.gym !== null && !named(event.gym))
      || !id(registration.registrationId) || !["CONFIRMED", "WAITLIST", "PENDING"].includes(registration.status)
      || !text(registration.registeredAt) || !Number.isFinite(Date.parse(registration.registeredAt))
      || (registration.division !== null && !named(registration.division))
      || seen.has(event._id.toLowerCase())) throw new Error("Invalid registered event");
    seen.add(event._id.toLowerCase());
  }
  return value.events;
}
export function myEventsProblem(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Your session has expired. Sign in again to view your events.";
  if (error instanceof ApiError && error.status === 403) return "Your account cannot access My Events.";
  return "Couldn't load your events. Please try again.";
}
