const TORONTO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's date in Toronto, where TopSend runs, as YYYY-MM-DD.
 *
 * @param {Date} [now] The moment to convert.
 * @returns {string} The date, for example 2026-10-04.
 */
export function torontoToday(now = new Date()) {
  return TORONTO_DATE.format(now);
}

/**
 * Reads a YYYY-MM-DD date. Dates that don't exist, such as 2026-02-30, are rejected.
 *
 * @param {string} value The date to read.
 * @returns {{ year: number, month: number, day: number, date: Date } | null} Its parts and the
 *   date at midnight UTC, or null when it isn't a real calendar date.
 */
export function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const exists =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return exists ? { year, month, day, date } : null;
}

/**
 * Counts the whole years from one calendar date to a later one, the way ages are counted.
 *
 * @param {{ year: number, month: number, day: number }} from The earlier date.
 * @param {{ year: number, month: number, day: number }} to The later date.
 * @returns {number} Whole years between them.
 */
export function wholeYearsBetween(from, to) {
  const beforeAnniversary =
    to.month < from.month || (to.month === from.month && to.day < from.day);
  return to.year - from.year - (beforeAnniversary ? 1 : 0);
}
