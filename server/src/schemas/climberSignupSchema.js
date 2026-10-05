import { z } from "zod";
import {
  ADDRESS_MAX_LENGTH,
  EARLIEST_BIRTH_YEAR,
  MINIMUM_AGE,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  POSTAL_CODE_MAX_LENGTH,
} from "../constants/accountLimits.js";
import { COUNTRY_CODES } from "../constants/countries.js";
import { GENDER_VALUES } from "../constants/genders.js";
import {
  parseCalendarDate,
  torontoToday,
  wholeYearsBetween,
} from "../utils/calendarDates.js";
import {
  normalizePostalCode,
  postalCodeMessage,
} from "../utils/postalCodes.js";
import { emailAddress, newPassword, required, text } from "./accountFields.js";

export const RECAPTCHA_REQUIRED_MESSAGE =
  "Check the box to show you're not a robot.";
const LOCATION_MESSAGE = "Choose your location again.";
const COUNTRY_SET = new Set(COUNTRY_CODES);
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

function isPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").length;
  return (
    PHONE_CHARACTERS.test(value) &&
    digits >= MIN_PHONE_DIGITS &&
    digits <= MAX_PHONE_DIGITS
  );
}

function coordinate(limit) {
  return z
    .number({ error: LOCATION_MESSAGE })
    .min(-limit, { error: LOCATION_MESSAGE })
    .max(limit, { error: LOCATION_MESSAGE });
}

const dateOfBirth = z
  .string(required("date of birth"))
  .trim()
  .min(1, required("date of birth"))
  .transform((value, ctx) => {
    const birth = parseCalendarDate(value);
    if (!birth || birth.year < EARLIEST_BIRTH_YEAR) {
      ctx.addIssue({ code: "custom", message: "Enter a real date of birth." });
      return z.NEVER;
    }

    const today = parseCalendarDate(torontoToday());
    if (birth.date > today.date) {
      ctx.addIssue({
        code: "custom",
        message: "That date is in the future.",
      });
      return z.NEVER;
    }
    if (wholeYearsBetween(birth, today) < MINIMUM_AGE) {
      ctx.addIssue({
        code: "custom",
        message: `You must be ${MINIMUM_AGE} or older.`,
      });
      return z.NEVER;
    }
    return birth.date;
  });

/**
 * Body of POST /api/users/climbers. Text is trimmed, the email is lowercased, the date of
 * birth becomes a Date, and the postal code is checked against the country's format. Keys
 * that aren't listed, including any role the client sends, are dropped. location is the
 * optional map pin, and website is the hidden honeypot field.
 */
export const climberSignupSchema = z
  .object({
    firstName: text("first name", NAME_MAX_LENGTH),
    lastName: text("last name", NAME_MAX_LENGTH),
    email: emailAddress,
    password: newPassword,
    dateOfBirth,
    gender: z.enum(GENDER_VALUES, { error: "Choose an option." }),
    phone: text("phone number", PHONE_MAX_LENGTH).refine(isPhoneNumber, {
      error: "Enter a valid phone number.",
    }),
    address: text("address", ADDRESS_MAX_LENGTH),
    postalCode: text("postal code", POSTAL_CODE_MAX_LENGTH),
    country: z
      .string({ error: "Choose your country." })
      .trim()
      .toUpperCase()
      .refine((code) => COUNTRY_SET.has(code), {
        error: "Choose your country.",
      }),
    location: z
      .object(
        { lat: coordinate(90), lng: coordinate(180) },
        { error: LOCATION_MESSAGE },
      )
      .optional(),
    acceptedTerms: z.literal(true, {
      error: "Agree to the Terms and Privacy Policy to continue.",
    }),
    recaptchaToken: z
      .string({ error: RECAPTCHA_REQUIRED_MESSAGE })
      .min(1, { error: RECAPTCHA_REQUIRED_MESSAGE }),
    website: z.unknown().optional(),
  })
  .transform((details, ctx) => {
    const postalCode = normalizePostalCode(details.postalCode, details.country);
    if (!postalCode) {
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: postalCodeMessage(details.country),
      });
      return z.NEVER;
    }
    return { ...details, postalCode };
  });
