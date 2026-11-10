import { COMPETITION_STATUS } from "../constants/competitions.js";
import { AppError } from "./AppError.js";

/**
 * When a competition starts (FR-004, AC-021): its calendar date at its start time, in Toronto.
 * Until then a Climber sees a countdown and only their registration status, so everything a
 * Climber opens during the competition checks hasStarted first.
 */

const TORONTO = "America/Toronto";

/** A start time as it's saved: 24-hour HH:mm, such as 10:00 or 18:30. */
export const START_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const TORONTO_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const TORONTO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO,
  year: "numeric",
  month: "long",
  day: "numeric",
});

const TORONTO_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** How far Toronto's clock is from UTC at an instant, in milliseconds. Negative: behind UTC. */
function torontoOffset(instant) {
  const parts = Object.fromEntries(
    TORONTO_CLOCK.formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]),
  );
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return shown - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a Toronto clock shows a date and time. The offset is looked up twice, since the
 * first guess can land on the other side of a clock change. A time the fall change repeats is its
 * first occurrence, and a time the spring change skips is moved an hour later, past the gap.
 */
function torontoInstant(year, month, day, hour, minute) {
  const wall = Date.UTC(year, month, day, hour, minute);
  const guess = wall - torontoOffset(wall);
  const instant = wall - torontoOffset(guess);
  return wall - torontoOffset(instant) === instant ? instant : Math.max(guess, instant);
}

/**
 * The start time a competition has, or null for one saved before start times existed.
 *
 * @param {{ startTime?: string | null }} competition The competition.
 * @returns {string | null} HH:mm, or null.
 */
export function startTimeOf(competition) {
  return typeof competition.startTime === "string" && START_TIME_PATTERN.test(competition.startTime)
    ? competition.startTime
    : null;
}

/**
 * The moment a competition starts. Without a start time, that's 12:00 a.m. on its date.
 *
 * @param {{ date: Date, startTime?: string | null }} competition Its date, at midnight UTC as
 *   competition dates are stored, and its start time.
 * @returns {Date} The start, as an instant.
 */
export function startsAtOf(competition) {
  const [hour, minute] = (startTimeOf(competition) ?? "00:00").split(":").map(Number);
  const { date } = competition;
  return new Date(torontoInstant(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));
}

/**
 * Whether a competition has started.
 *
 * @param {{ date: Date, startTime?: string | null }} competition The competition.
 * @param {Date} [now] The moment to check.
 * @returns {boolean} True from its start on.
 */
export function hasStarted(competition, now = new Date()) {
  return now.getTime() >= startsAtOf(competition).getTime();
}

/**
 * What a Climber's pages need to show a competition's start: its start time, the instant it
 * starts, for a countdown that's right in any time zone, and whether that has come.
 *
 * @param {{ date: Date, startTime?: string | null }} competition The competition.
 * @param {Date} [now] The moment to check.
 * @returns {{ startTime: string | null, startsAt: string, started: boolean }}
 */
export function startFields(competition, now = new Date()) {
  const startsAt = startsAtOf(competition);
  return {
    startTime: startTimeOf(competition),
    startsAt: startsAt.toISOString(),
    started: now.getTime() >= startsAt.getTime(),
  };
}

/**
 * The refusal for something that opens at the start. details.startsAt lets the page count down
 * and ask again by itself.
 *
 * @param {{ date: Date, startTime?: string | null }} competition The competition.
 * @param {string} [opens] What opens at the start, as a sentence.
 * @returns {AppError} 409 COMPETITION_NOT_STARTED.
 */
export function competitionNotStarted(competition, opens = "Your scorecard and the leaderboard open then.") {
  const startsAt = startsAtOf(competition);
  // The time ends with a period of its own, as in "10:00 a.m.", so the sentence adds none after it.
  const time = TORONTO_TIME.format(startsAt);
  const starts = `This competition starts on ${TORONTO_DAY.format(startsAt)} at ${time}`;
  const error = new AppError(409, "COMPETITION_NOT_STARTED", `${starts}${time.endsWith(".") ? "" : "."} ${opens}`);
  error.details = { startsAt: startsAt.toISOString() };
  return error;
}

/**
 * Holds a Climber or a Visitor back until a PUBLISHED competition starts (AC-021). A cancelled
 * competition has no start to wait for, so it's never held back, and neither is a draft, which
 * the access checks before this one already refuse.
 *
 * @param {{ status: string, date: Date, startTime?: string | null }} competition The competition.
 * @param {{ now?: Date, opens?: string }} [options] The moment to check, and what opens.
 * @throws {AppError} 409 COMPETITION_NOT_STARTED.
 */
export function assertStarted(competition, { now = new Date(), opens } = {}) {
  if (competition.status !== COMPETITION_STATUS.PUBLISHED) return;
  if (!hasStarted(competition, now)) throw competitionNotStarted(competition, opens);
}
