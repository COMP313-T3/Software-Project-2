import type { DiscoveredEventDetails } from "./discoveryApi.ts";

function validCount(value: number) { return Number.isSafeInteger(value) && value >= 0; }
/** A capacity or space count to show, or "Not available" when the API's value isn't a count. */
export function displayEventCount(value: number) { return validCount(value) ? value.toLocaleString("en-CA") : "Not available"; }
/** The event's registration state for its badge: Closed, Full, Open or Unavailable. */
export function eventRegistrationStatus(event: DiscoveredEventDetails) {
  if (!event.upcoming || event.registrationStatus === "CLOSED") return "Closed";
  if (event.full || (validCount(event.spacesLeft) && event.spacesLeft === 0)) return "Full";
  return event.registrationStatus === "OPEN" && validCount(event.spacesLeft) ? "Open" : "Unavailable";
}
/** Why the Climber can't register for the event right now, or "" when they can. Any of the
 * event's divisions can be chosen: #109/#110 define eligibility as membership in the event and
 * check the division and the event's availability again on every write. */
export function registrationBlockReason(event: DiscoveredEventDetails) {
  if (event.myRegistration) return "You already have a registration for this competition.";
  if (!event.upcoming) return "Registration is closed because this competition has ended.";
  const status = eventRegistrationStatus(event);
  if (status === "Closed") return "Registration is closed for this competition.";
  if (status === "Full") return "This competition is full.";
  if (!validCount(event.spacesLeft) || !validCount(event.capacity) || event.capacity === 0 || status === "Unavailable") {
    return "Registration availability could not be confirmed. Refresh event details.";
  }
  if (!event.divisions.length) return "Registration is unavailable until divisions are announced.";
  if (!event.registrationAvailable) return "Registration is currently unavailable. Refresh event details.";
  return "";
}
