const CALENDAR_DATE = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const TORONTO_DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

const CLOCK_TIME = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/**
 * Formats a competition's start time, such as "10:00 a.m.". The API sends it as the time on
 * Toronto's clock, so it's shown as it is, whatever the browser's own time zone is.
 *
 * @param value The time as 24-hour HH:mm, or null when the competition has none.
 * @returns The readable time, or null when the value isn't a time.
 */
export function formatStartTime(value: string | null | undefined): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "");
  if (!match) return null;
  return CLOCK_TIME.format(new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2]))));
}

/**
 * Formats a competition's date with its start time, such as "Nov 14, 2026 at 10:00 a.m.", or the
 * date alone for a competition without a start time.
 *
 * @param date The date as YYYY-MM-DD.
 * @param startTime The start time as HH:mm, or null.
 * @returns The readable date and time.
 */
export function formatCompetitionStart(date: string, startTime: string | null | undefined): string {
  const time = formatStartTime(startTime);
  return time ? `${formatCalendarDate(date)} at ${time}` : formatCalendarDate(date);
}

/**
 * Formats a competition's calendar date, such as "Nov 14, 2026". The API sends competition dates
 * as YYYY-MM-DD calendar days, so they're read as UTC midnight and never shift a day.
 *
 * @param value The date as YYYY-MM-DD.
 * @returns The readable date, or "Date unavailable" when the value isn't a date.
 */
export function formatCalendarDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : CALENDAR_DATE.format(date);
}

/**
 * Formats a moment in Toronto time, such as "Oct 15, 2026, 10:37 p.m.", whatever the
 * browser's own time zone is.
 *
 * @param value An ISO 8601 timestamp from the API.
 * @returns The readable date and time, or "Unavailable" when the value isn't a date.
 */
export function formatTorontoDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : TORONTO_DATE_TIME.format(date);
}
