import { describe, expect, it } from "vitest";
import { formatCalendarDate, formatCompetitionStart, formatStartTime, formatTimeRange, formatTorontoDateTime } from "./dateFormat.ts";

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

  it.each([
    ["00:00", "12:00 a.m."],
    ["09:05", "9:05 a.m."],
    ["10:00", "10:00 a.m."],
    ["12:00", "12:00 p.m."],
    ["18:30", "6:30 p.m."],
    ["23:59", "11:59 p.m."],
  ])("shows the start time %s as %s, as it is on Toronto's clock", (value, shown) => {
    expect(formatStartTime(value)).toBe(shown);
  });

  it.each([null, undefined, "", "24:00", "10:60", "9:30", "10am"])("shows no start time for %j", (value) => {
    expect(formatStartTime(value)).toBeNull();
  });

  it("shows a competition's date with its start time, or the date alone without one", () => {
    expect(formatCompetitionStart("2026-11-14", "10:00")).toBe("Nov 14, 2026 at 10:00 a.m.");
    expect(formatCompetitionStart("2026-11-14", null)).toBe("Nov 14, 2026");
  });

  it("says when a value isn't a date", () => {
    expect(formatCalendarDate("not a date")).toBe("Date unavailable");
    expect(formatTorontoDateTime("not a date")).toBe("Unavailable");
  });
});

describe("a competition's times", () => {
  it.each([
    ["10:00", "18:00", "10:00 a.m. to 6:00 p.m."],
    ["00:00", "12:30", "12:00 a.m. to 12:30 p.m."],
    ["10:00", null, "10:00 a.m."],
    [null, "18:00", "Until 6:00 p.m."],
    [null, null, null],
    ["24:00", "6pm", null],
  ])("shows a start of %j and an end of %j as %j", (startTime, endTime, shown) => {
    expect(formatTimeRange(startTime, endTime)).toBe(shown);
  });
});
