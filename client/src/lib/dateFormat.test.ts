import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatTorontoDateTime } from "./dateFormat.ts";

describe("date formatting", () => {
  it("shows a competition's calendar date without shifting the day", () => {
    expect(formatCalendarDate("2026-11-14")).toBe("Nov 14, 2026");
    expect(formatCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("shows timestamps in Toronto time, across the UTC day boundary", () => {
    expect(formatTorontoDateTime("2026-10-16T02:37:08Z")).toBe(
      "Oct 15, 2026, 10:37 p.m.",
    );
    expect(formatTorontoDateTime("2026-12-01T17:05:00Z")).toBe(
      "Dec 1, 2026, 12:05 p.m.",
    );
  });

  it("says when a value isn't a date", () => {
    expect(formatCalendarDate("not a date")).toBe("Date unavailable");
    expect(formatTorontoDateTime("not a date")).toBe("Unavailable");
  });
});
