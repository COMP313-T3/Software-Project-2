import { describe, expect, it } from "vitest";
import {
  parseCalendarDate,
  torontoToday,
  wholeYearsBetween,
} from "../src/utils/calendarDates.js";
import {
  normalizePostalCode,
  postalCodeMessage,
} from "../src/utils/postalCodes.js";

describe("calendar dates", () => {
  it("gives today's date in Toronto, not in UTC", () => {
    expect(torontoToday(new Date("2026-10-05T02:30:00Z"))).toBe("2026-10-04");
    expect(torontoToday(new Date("2026-10-05T04:30:00Z"))).toBe("2026-10-05");
  });

  it("reads real dates and refuses ones that don't exist", () => {
    expect(parseCalendarDate("2024-02-29")).toMatchObject({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(parseCalendarDate("2023-02-29")).toBeNull();
    expect(parseCalendarDate("0005-01-01")?.year).toBe(5);
    expect(parseCalendarDate("2024-2-9")).toBeNull();
  });

  it("counts ages the usual way", () => {
    const birth = { year: 2013, month: 10, day: 5 };

    expect(wholeYearsBetween(birth, { year: 2026, month: 10, day: 4 })).toBe(
      12,
    );
    expect(wholeYearsBetween(birth, { year: 2026, month: 10, day: 5 })).toBe(
      13,
    );
  });
});

describe("postal codes", () => {
  it("tidies Canadian postal codes and refuses letters Canada doesn't use", () => {
    expect(normalizePostalCode(" m5h2n2 ", "CA")).toBe("M5H 2N2");
    expect(normalizePostalCode("k1a-0b1", "CA")).toBe("K1A 0B1");
    expect(normalizePostalCode("D5H 2N2", "CA")).toBeNull();
    expect(normalizePostalCode("12345", "CA")).toBeNull();
  });

  it("accepts US ZIP codes with or without the extra four digits", () => {
    expect(normalizePostalCode("10001", "US")).toBe("10001");
    expect(normalizePostalCode("10001-1234", "US")).toBe("10001-1234");
    expect(normalizePostalCode("1000", "US")).toBeNull();
  });

  it("only loosely checks other countries", () => {
    expect(normalizePostalCode("sw1a  1aa", "GB")).toBe("SW1A 1AA");
    expect(normalizePostalCode("!", "GB")).toBeNull();
  });

  it("explains the format the country uses", () => {
    expect(postalCodeMessage("CA")).toBe("Use the format A1A 1A1.");
    expect(postalCodeMessage("US")).toBe("Use the format 12345.");
    expect(postalCodeMessage("FR")).toBe("Enter a valid postal code.");
  });
});
