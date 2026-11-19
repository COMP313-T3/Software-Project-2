import { ApiError } from "./apiClient.ts";
import type { ResultClimber, ResultEntry, ResultOptions, ResultRoute, SaveResultInput } from "./resultsApi.ts";

export const resultClimberName = (climber: ResultClimber) => [climber.firstName, climber.lastName].filter(Boolean).join(" ") || "Climber " + climber._id;
export const resultRouteName = (route: ResultRoute) => "Route " + route.routeNumber + (route.name ? " — " + route.name : "") + " (" + route.grade + ")";
export type ResultFields = Partial<Record<"attempts" | "sent" | "flash", string>>;
export type ResultAction = { kind: "save"; input: SaveResultInput } | { kind: "attempt"; sent: boolean };
export function validateResultInput(attempts: string, sent: boolean, maximum: number): { input: SaveResultInput | null; fields: ResultFields } {
  if (!/^\d+$/.test(attempts.trim()) || !Number.isSafeInteger(Number(attempts)) || Number(attempts) > maximum) return { input: null, fields: { attempts: `Enter a whole number of attempts from 0 to ${maximum}.` } };
  if (sent && Number(attempts) === 0) return { input: null, fields: { attempts: "A send needs at least one attempt." } };
  return { input: { attempts: Number(attempts), sent }, fields: {} };
}
export function entryBlocker(options: ResultOptions, entry: ResultEntry): string {
  if (!options.canRecord.allowed) return options.canRecord.reasons.join(" ") || "Result entry is unavailable for this competition.";
  if (!options.scoring?.records.attempts || !options.scoring.records.sends) return "This scoring format does not support these result controls.";
  if (!entry.scoring) return "Set the competition's scoring before recording results.";
  if (entry.climber.registrationStatus !== "CONFIRMED") return "This Climber no longer has a confirmed registration. Choose a Climber with a confirmed registration.";
  if (entry.route.pointValue === null) return "This route needs a point value before results can be recorded.";
  return "";
}
export function resultProblem(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : fallback;
}
