import { ApiError } from "./apiClient.ts";

/** When a competition starts, as the API sends it with a Climber's competition (AC-021). */
export interface CompetitionStart {
  /** The start time on Toronto's clock as HH:mm, or null for a competition without one. */
  startTime: string | null;
  /** The moment it starts, or null when the API didn't say. */
  startsAt: string | null;
  /** Whether the server says it has started. */
  started: boolean;
}

const START_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Reads the start of a competition from an API answer. An answer without it counts as started:
 * the server decides what a Climber can open, so the page never locks something on a guess.
 *
 * @param value The competition as the API sent it.
 * @returns Its start.
 */
export function readCompetitionStart(value: unknown): CompetitionStart {
  const competition = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const startsAt = timestamp(competition.startsAt);
  return {
    startTime:
      typeof competition.startTime === "string" && START_TIME.test(competition.startTime)
        ? competition.startTime
        : null,
    startsAt,
    started: startsAt === null || competition.started !== false,
  };
}

/**
 * Whether a competition is still waiting for its start, so a Climber sees the countdown and only
 * their registration status. A cancelled competition has no start to wait for.
 *
 * @param competition Its status and start.
 */
export function awaitingStart(competition: { status?: string | null } & Partial<CompetitionStart>): boolean {
  return (
    (competition.status ?? "PUBLISHED") === "PUBLISHED" &&
    competition.started === false &&
    Boolean(competition.startsAt)
  );
}

/**
 * The moment a competition starts, from the API's refusal of something that opens then.
 *
 * @param error What an API call or a live connection answered.
 * @returns The start as a timestamp, or null when the error is something else.
 */
export function startsAtFrom(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== "COMPETITION_NOT_STARTED") return null;
  return timestamp(error.details?.startsAt);
}

/**
 * The same refusal from a live connection, which answers { error, message, details } instead of an
 * HTTP status.
 *
 * @param value The refusal.
 * @returns The error, or null when the refusal is something else.
 */
export function notStartedProblem(value: unknown): ApiError | null {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (data.error !== "COMPETITION_NOT_STARTED") return null;
  const details =
    data.details && typeof data.details === "object" ? (data.details as Record<string, unknown>) : undefined;
  const message =
    typeof data.message === "string" && data.message ? data.message : "This competition hasn't started yet.";
  return new ApiError(409, "COMPETITION_NOT_STARTED", message, undefined, details);
}

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Whole seconds left, never below 0. */
  total: number;
}

/**
 * How long is left until a moment, in whole days, hours, minutes and seconds, counted up so the
 * last second shows as 1 and the moment itself as 0.
 *
 * @param until The moment, as a timestamp.
 * @param now The current time, in milliseconds.
 */
export function timeLeft(until: string, now: number): TimeLeft {
  const total = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    total,
  };
}

const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? "" : "s"}`;

/**
 * Time left as a sentence a screen reader can read, such as "2 days, 3 hours and 5 minutes". The
 * seconds are only said in the last minute, so it doesn't change every second before then.
 *
 * @param left From timeLeft.
 */
export function timeLeftText(left: TimeLeft): string {
  if (left.total === 0) return "no time";
  if (left.total < 60) return unit(left.seconds, "second");
  const parts = [
    left.days ? unit(left.days, "day") : "",
    left.hours ? unit(left.hours, "hour") : "",
    left.minutes ? unit(left.minutes, "minute") : "",
  ].filter(Boolean);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
