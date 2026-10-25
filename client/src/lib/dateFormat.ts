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
