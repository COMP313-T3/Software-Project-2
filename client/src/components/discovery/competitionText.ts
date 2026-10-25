import type { DiscoveredCompetition } from "../../lib/discoveryApi.ts";

/**
 * How many spaces a competition has left, or that it's full.
 *
 * @param competition The competition, as the discovery API sends it.
 * @returns Text like "12 spaces left" or "Full, no spaces left".
 */
export function spacesText({ full, spacesLeft }: DiscoveredCompetition): string {
  if (full) return "Full, no spaces left";
  return `${spacesLeft} ${spacesLeft === 1 ? "space" : "spaces"} left`;
}

/**
 * How many Climbers have a confirmed registration.
 *
 * @param joined The number of Climbers.
 * @returns Text like "12 Climbers joined", or "No Climbers joined yet".
 */
export function joinedText(joined: number): string {
  if (joined === 0) return "No Climbers joined yet";
  return `${joined} ${joined === 1 ? "Climber" : "Climbers"} joined`;
}

/**
 * A competition's distance from the point the Climber searched from.
 *
 * @param km The distance in kilometres.
 * @returns Text like "3.4 km away".
 */
export function distanceText(km: number): string {
  return `${km.toLocaleString("en-CA", { maximumFractionDigits: 1 })} km away`;
}

/**
 * The Event Details page of a competition, with the current discovery search kept so the page
 * can lead back to the same results.
 *
 * @param competitionId The competition's ID.
 * @param search The discovery search without its "?", or "" for none.
 * @returns The path to link to.
 */
export function eventDetailsPath(competitionId: string, search: string): string {
  return `/competitions/${encodeURIComponent(competitionId)}${search ? `?${search}` : ""}`;
}
