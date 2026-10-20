import { ApiError, apiRequest } from "./apiClient.ts";
import { getDiscoveredEvent } from "./discoveryApi.ts";
import { withAccessToken } from "./sessionClient.ts";

export type ClimberRegistrationState = "CONFIRMED" | "WAITLIST" | "PENDING" | "NOT_REGISTERED" | "UNAVAILABLE";
export interface RegistrationStatusData {
  competition: {
    _id: string;
    name: string;
    date: string;
    location: string | null;
    gymName: string | null;
    status: string | null;
    upcoming: boolean | null;
    registrationStatus: string | null;
  };
  state: ClimberRegistrationState;
  divisionName: string | null;
  registeredAt: string | null;
  waitlistPosition: number | null;
  capacity: { maximum: number | null; spacesLeft: number | null; full: boolean | null };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
function count(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function boolean(value: unknown) { return typeof value === "boolean" ? value : null; }

function competitionDetails(value: unknown, requestedId: string): RegistrationStatusData["competition"] {
  const competition = record(value);
  const id = text(competition?._id);
  const name = text(competition?.name);
  if (!id || id.toLowerCase() !== requestedId.toLowerCase() || !name) {
    throw new Error("Registration information did not match the selected competition.");
  }
  return {
    _id: id, name, date: text(competition?.date) ?? "",
    location: text(competition?.location), gymName: text(record(competition?.gym)?.name),
    status: text(competition?.status), upcoming: boolean(competition?.upcoming),
    registrationStatus: text(competition?.registrationStatus),
  };
}

/** Missing/malformed status is unknown, never a confirmed or absent registration.
 * Personal registration and event capacity remain independent (US-029 AC 1–5). */
export function readRegistrationStatus(value: unknown, requestedId: string): RegistrationStatusData {
  const data = record(value);
  const competition = competitionDetails(data?.competition, requestedId);
  const registration = record(data?.registration);
  const capacity = record(data?.capacity);
  const status = registration?.status;
  let state: ClimberRegistrationState = "UNAVAILABLE";
  if (text(registration?.registrationId)) {
    if (status === "CONFIRMED" && registration?.confirmed === true) state = "CONFIRMED";
    if (status === "WAITLIST" && registration?.confirmed === false) state = "WAITLIST";
    if (status === "PENDING" && registration?.confirmed === false) state = "PENDING";
  }
  const position = count(registration?.waitlistPosition);
  return {
    competition, state, divisionName: text(record(registration?.division)?.name),
    registeredAt: text(registration?.registeredAt), waitlistPosition: position !== null && position > 0 ? position : null,
    capacity: { maximum: count(capacity?.capacity), spacesLeft: count(capacity?.spacesLeft), full: boolean(capacity?.full) },
  };
}

function read(id: string, signal?: AbortSignal) {
  return withAccessToken(token => apiRequest<unknown>(`/api/competitions/${encodeURIComponent(id)}/registration`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  }));
}

/** #116 returns REGISTRATION_NOT_FOUND without a competition/capacity DTO.
 * Only that explicit response permits a discovery read for the empty/Full state.
 * Generic 404, forbidden, server and network failures never mean "not registered".
 * All calls are GETs; identity comes exclusively from the bearer session. */
export async function getRegistrationStatus(id: string, signal?: AbortSignal): Promise<RegistrationStatusData> {
  try {
    return readRegistrationStatus(await read(id, signal), id);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404 || error.code !== "REGISTRATION_NOT_FOUND") throw error;
  }
  const event = await getDiscoveredEvent(id, signal);
  // A registration may have committed between the two reads. Read the status again
  // rather than showing an incorrect empty state or inventing a confirmation.
  if (event.myRegistration) return readRegistrationStatus(await read(id, signal), id);
  return {
    competition: competitionDetails({ ...event, status: "PUBLISHED" }, id),
    state: "NOT_REGISTERED", divisionName: null, registeredAt: null, waitlistPosition: null,
    capacity: { maximum: count(event.capacity), spacesLeft: count(event.spacesLeft), full: boolean(event.full) },
  };
}
