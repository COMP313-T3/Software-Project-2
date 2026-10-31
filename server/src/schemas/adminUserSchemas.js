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
import { emailAddress, text } from "./accountFields.js";
import { objectId } from "./commonFields.js";

/** Params for PATCH /api/admin/users/:userId/deactivate. */
export const userIdParamsSchema = z.object({
  userId: objectId("user"),
});

const COUNTRY_SET = new Set(COUNTRY_CODES);
const LOCATION_MESSAGE = "Choose a valid location.";
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;

function isPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").length;
  return PHONE_CHARACTERS.test(value) && digits >= 7 && digits <= 15;
}

function coordinate(limit) {
  return z
    .number({ error: LOCATION_MESSAGE })
    .min(-limit, { error: LOCATION_MESSAGE })
    .max(limit, { error: LOCATION_MESSAGE });
}

const dateOfBirthSchema = z
  .string({ error: "Enter a real date of birth." })
  .trim()
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

const locationSchema = z.object(
  {
    lat: coordinate(90),
    lng: coordinate(180),
  },
  { error: LOCATION_MESSAGE },
);

/** Body of PATCH /api/admin/users/:userId. Role and permission changes are not allowed. */
export const updateUserSchema = z
  .object({
    firstName: text("first name", NAME_MAX_LENGTH).optional(),
    lastName: text("last name", NAME_MAX_LENGTH).optional(),
    email: emailAddress.optional(),
    phone: text("phone number", PHONE_MAX_LENGTH)
      .refine(isPhoneNumber, { error: "Enter a valid phone number." })
      .optional(),
    address: text("address", ADDRESS_MAX_LENGTH).optional(),
    postalCode: text("postal code", POSTAL_CODE_MAX_LENGTH)
      .transform((value) => value.toUpperCase())
      .optional(),
    country: z
      .string({ error: "Choose your country." })
      .trim()
      .toUpperCase()
      .refine((code) => COUNTRY_SET.has(code), {
        error: "Choose your country.",
      })
      .optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    gender: z.enum(GENDER_VALUES, { error: "Choose an option." }).optional(),
    location: z.union([locationSchema, z.null()]).optional(),
  })
  .strict()
  .refine((details) => Object.keys(details).length > 0, {
    error: "Change at least one account detail.",
  });
