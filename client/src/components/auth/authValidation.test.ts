import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fieldError,
  MIN_PASSWORD_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  torontoToday,
} from "./authValidation.ts";

const TODAY = "2026-10-04";

describe("fieldError", () => {
  it("asks for any empty or blank field by its label", () => {
    expect(fieldError("text", "First name", "")).toBe("Enter your first name.");
    expect(fieldError("email", "Email", "   ")).toBe("Enter your email.");
    expect(fieldError("current-password", "Password", "")).toBe(
      "Enter your password.",
    );
    expect(fieldError("choice", "Gender", "")).toBe("Choose an option.");
    expect(fieldError("country", "Country", "")).toBe("Choose your country.");
  });

  it("rejects an email address without a domain", () => {
    expect(fieldError("email", "Email", "climber@")).toBe(
      "Enter an email address like name@example.com.",
    );
    expect(fieldError("email", "Email", "climber.example.com")).toBe(
      "Enter an email address like name@example.com.",
    );
  });

  it("accepts a normal email address, ignoring spaces around it", () => {
    expect(fieldError("email", "Email", "  gab@topsend.ca ")).toBe("");
  });

  it("checks an email address the way the server does", () => {
    for (const email of ["o'neil@topsend.ca", "Gab.Climber+comps@Top-Send.CA"]) {
      expect(fieldError("email", "Email", email)).toBe("");
    }
    for (const email of [
      "gab..climber@topsend.ca",
      ".gab@topsend.ca",
      "gab.@topsend.ca",
      "gab!climber@topsend.ca",
      "gab@-topsend.ca",
      "gab@topsend.c",
    ]) {
      expect(fieldError("email", "Email", email)).toBe(
        "Enter an email address like name@example.com.",
      );
    }
  });

  it("refuses a value longer than the server accepts, counted after trimming", () => {
    const options = { maxLength: NAME_MAX_LENGTH };
    const longest = "a".repeat(NAME_MAX_LENGTH);

    expect(fieldError("text", "First name", ` ${longest} `, {}, options)).toBe("");
    expect(fieldError("text", "First name", `${longest}a`, {}, options)).toBe(
      "Use 50 characters or fewer.",
    );
    expect(
      fieldError("email", "Email", `${"a".repeat(250)}@x.ca`, {}, {
        maxLength: 254,
      }),
    ).toBe("Use 254 characters or fewer.");
  });

  it("counts every character of a new password, spaces included", () => {
    const options = { maxLength: PASSWORD_MAX_LENGTH };
    const longest = `Chalk up & send ${"a".repeat(PASSWORD_MAX_LENGTH - 16)}`;

    expect(fieldError("new-password", "Password", longest, {}, options)).toBe("");
    expect(
      fieldError("new-password", "Password", `${longest} `, {}, options),
    ).toBe("Use 128 characters or fewer.");
    expect(
      fieldError("new-password", "Password", "a".repeat(200), {}, options),
    ).toBe("Use 128 characters or fewer.");
  });

  it("explains the first password rule a new password misses", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(fieldError("new-password", "Password", "Ab1")).toBe(
      "Use at least 12 characters.",
    );
    expect(fieldError("new-password", "Password", "CHALK UP & SEND")).toBe(
      "Add a lowercase letter.",
    );
    expect(fieldError("new-password", "Password", "chalk up & send")).toBe(
      "Add an uppercase letter.",
    );
    expect(fieldError("new-password", "Password", "Chalk up and send")).toBe(
      "Add a number or a symbol.",
    );
    expect(fieldError("new-password", "Password", "Chalk up & send")).toBe("");
  });

  it("lists the password rules in the order they are checked", () => {
    expect(PASSWORD_RULES.map((rule) => rule.label)).toEqual([
      "12 or more characters",
      "A lowercase letter",
      "An uppercase letter",
      "A number or symbol",
    ]);
  });

  it("does not limit the length of a password typed to log in", () => {
    expect(fieldError("current-password", "Password", "short")).toBe("");
  });

  it("needs the confirmed password to match the password exactly", () => {
    const values = { password: "Chalk up & send" };

    expect(fieldError("confirm-password", "Confirm password", "", values)).toBe(
      "Re-enter your password.",
    );
    expect(
      fieldError(
        "confirm-password",
        "Confirm password",
        "Chalk up & sen",
        values,
      ),
    ).toBe("Passwords don't match.");
    expect(
      fieldError(
        "confirm-password",
        "Confirm password",
        "chalk up & send",
        values,
      ),
    ).toBe("Passwords don't match.");
    expect(
      fieldError(
        "confirm-password",
        "Confirm password",
        "Chalk up & send",
        values,
      ),
    ).toBe("");
  });

  it("needs a real date of birth that makes the climber at least 13", () => {
    const check = (value: string) =>
      fieldError("date-of-birth", "Date of birth", value, {}, { today: TODAY });

    expect(check("2013-10-04")).toBe("");
    expect(check("2013-10-05")).toBe("You must be 13 or older.");
    expect(check("2026-10-05")).toBe("That date is in the future.");
    expect(check("2001-02-29")).toBe("Enter a real date of birth.");
    expect(check("1899-12-31")).toBe("Enter a real date of birth.");
  });

  it("checks phone numbers loosely", () => {
    expect(fieldError("phone", "Phone number", "(416) 555-0123")).toBe("");
    expect(fieldError("phone", "Phone number", "+44 20 7946 0958")).toBe("");
    expect(fieldError("phone", "Phone number", "555")).toBe(
      "Enter a valid phone number.",
    );
    expect(fieldError("phone", "Phone number", "call me")).toBe(
      "Enter a valid phone number.",
    );
  });

  it("checks the postal code against the chosen country", () => {
    const check = (value: string, country: string) =>
      fieldError("postal-code", "Postal code", value, { country });

    expect(check("m5h 2n2", "CA")).toBe("");
    expect(check("12345", "CA")).toBe("Use the format A1A 1A1.");
    expect(check("12345", "US")).toBe("");
    expect(check("M5H 2N2", "US")).toBe("Use the format 12345.");
    expect(check("SW1A 1AA", "GB")).toBe("");
  });

  it("only accepts known country codes", () => {
    expect(fieldError("country", "Country", "CA")).toBe("");
    expect(fieldError("country", "Country", "XX")).toBe("Choose your country.");
  });
});

describe("torontoToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the date in Toronto as YYYY-MM-DD, whatever the device's time zone", () => {
    expect(torontoToday(new Date("2026-10-05T03:30:00Z"))).toBe("2026-10-04");
    expect(torontoToday(new Date("2026-01-09T17:00:00Z"))).toBe("2026-01-09");
  });

  it("is the day a date of birth is checked against", () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T02:00:00Z") });

    expect(fieldError("date-of-birth", "Date of birth", "2013-10-05")).toBe(
      "You must be 13 or older.",
    );
    expect(fieldError("date-of-birth", "Date of birth", "2013-10-04")).toBe("");
  });
});
