import {
  COMPETITION_DESCRIPTION_MAX_LENGTH,
  COMPETITION_LOCATION_MAX_LENGTH,
  COMPETITION_MAX_CAPACITY,
  COMPETITION_MAX_YEARS_AHEAD,
  COMPETITION_NAME_MAX_LENGTH,
} from "../constants/competitions.ts";
import type { ManagedGym } from "./gymAdminApi.ts";
import { validateScoring } from "./scoringValidation.ts";

export interface CompetitionFormValues {
  gymId: string;
  name: string;
  date: string;
  location: string;
  description: string;
  capacity: string;
  deductionPercent: string;
  maxAttempts: string;
}
export type CompetitionField = keyof CompetitionFormValues;
export type CompetitionFieldErrors = Partial<Record<CompetitionField, string>>;
export const COMPETITION_FIELD_ORDER: CompetitionField[] = [
  "gymId", "name", "date", "capacity", "location", "description",
  "deductionPercent", "maxAttempts",
];

const torontoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
});

function parseDate(value: string): Date | null {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day ? date : null;
}

/** A calendar date, never shifted by the browser's time zone. Matches the creation API. */
export function competitionDateBounds(now = new Date()) {
  const min = torontoDate.format(now);
  const latest = parseDate(min)!;
  latest.setUTCFullYear(latest.getUTCFullYear() + COMPETITION_MAX_YEARS_AHEAD);
  return { min, max: latest.toISOString().slice(0, 10) };
}

/** Checks the create competition form before it's sent (US-012, FR-004, AC-007), including its
 * scoring (US-018). The server checks it again. */
export function validateCompetitionForm(
  values: CompetitionFormValues,
  gyms: readonly Pick<ManagedGym, "_id">[],
  now = new Date(),
): CompetitionFieldErrors {
  const errors: CompetitionFieldErrors = {};
  if (gyms.length > 1 && !gyms.some(gym => gym._id === values.gymId)) {
    errors.gymId = "Choose which of your gyms runs this competition.";
  }
  if (!values.name.trim()) errors.name = "Enter the competition name.";
  else if (values.name.trim().length > COMPETITION_NAME_MAX_LENGTH) {
    errors.name = "Use " + COMPETITION_NAME_MAX_LENGTH + " characters or fewer.";
  }
  const date = values.date.trim();
  const bounds = competitionDateBounds(now);
  if (!date) errors.date = "Choose the event date.";
  else if (!parseDate(date)) errors.date = "Enter a real date, like 2026-11-14.";
  else if (date < bounds.min) errors.date = "Choose today or a later date.";
  else if (date > bounds.max) errors.date = "Choose a date within " + COMPETITION_MAX_YEARS_AHEAD + " years.";

  for (const [field, max] of [
    ["location", COMPETITION_LOCATION_MAX_LENGTH],
    ["description", COMPETITION_DESCRIPTION_MAX_LENGTH],
  ] as const) {
    if (values[field].trim().length > max) errors[field] = "Use " + max + " characters or fewer.";
  }
  const capacity = Number(values.capacity);
  if (!values.capacity.trim() || !Number.isInteger(capacity) || capacity < 1 || capacity > COMPETITION_MAX_CAPACITY) {
    errors.capacity = "Enter the maximum number of participants, from 1 to " + COMPETITION_MAX_CAPACITY + ".";
  }
  return { ...errors, ...validateScoring(values) };
}
