import type { DiscoveredEventDetails } from "./discoveryApi.ts";

/** UI data only. The current backend defines eligibility as membership in the
 * selected event; it has no age/gender rules or separate division capacity. */
export interface DivisionRegistrationInfo {
  divisionId: string;
  requirements: string[] | null;
  eligible: boolean | null;
  available: boolean | null;
  reason?: string;
}
export interface EventRegistrationSetup {
  ready: boolean;
  timeLabel: string | null;
  divisions: DivisionRegistrationInfo[];
}
export interface DivisionChoice extends DivisionRegistrationInfo { name: string }

/** #109/#110 validate division membership and event availability on every write.
 * The protected GET contains only this event's divisions. Do not infer additional
 * restrictions from their names. Event time is still absent from the API. */
export function prepareEventRegistration(event: DiscoveredEventDetails): EventRegistrationSetup {
  return {
    ready: true,
    timeLabel: null,
    divisions: event.divisions.map(division => ({
      divisionId: division._id, requirements: [], eligible: true, available: true,
    })),
  };
}
export function eventDivisionChoices(event: DiscoveredEventDetails, setup: EventRegistrationSetup): DivisionChoice[] {
  return event.divisions.map(division => ({
    divisionId: division._id, requirements: null, eligible: null, available: null,
    ...setup.divisions.find(info => info.divisionId === division._id), name: division.name,
  }));
}
export function selectableDivision(division: DivisionRegistrationInfo) {
  return division.eligible === true && division.available === true;
}
function validCount(value: number) { return Number.isSafeInteger(value) && value >= 0; }
export function displayEventCount(value: number) { return validCount(value) ? value.toLocaleString("en-CA") : "Not available"; }
export function eventRegistrationStatus(event: DiscoveredEventDetails) {
  if (!event.upcoming || event.registrationStatus === "CLOSED") return "Closed";
  if (event.full || (validCount(event.spacesLeft) && event.spacesLeft === 0)) return "Full";
  return event.registrationStatus === "OPEN" && validCount(event.spacesLeft) ? "Open" : "Unavailable";
}
export function registrationBlockReason(event: DiscoveredEventDetails, setup: EventRegistrationSetup, choices: DivisionChoice[]) {
  if (event.myRegistration) return "You already have a registration for this competition.";
  if (!event.upcoming) return "Registration is closed because this competition has ended.";
  const status = eventRegistrationStatus(event);
  if (status === "Closed") return "Registration is closed for this competition.";
  if (status === "Full") return "This competition is full.";
  if (!validCount(event.spacesLeft) || !validCount(event.capacity) || event.capacity === 0 || status === "Unavailable") {
    return "Registration availability could not be confirmed. Refresh event details.";
  }
  if (!event.divisions.length) return "Registration is unavailable until divisions are announced.";
  if (!setup.ready) return "Registration is not available for this event yet.";
  if (!event.registrationAvailable) return "Registration is currently unavailable. Refresh event details.";
  if (!choices.some(selectableDivision)) return "No eligible divisions are currently available to select.";
  return "";
}
