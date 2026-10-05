import { describe, expect, it } from "vitest";
import {
  fieldError,
  localToday,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
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
      fieldError("date-of-birth", "Date of birth", value, {}, TODAY);

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

describe("localToday", () => {
  it("formats the device's date as YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 9, 4, 23, 30))).toBe("2026-10-04");
    expect(localToday(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});
