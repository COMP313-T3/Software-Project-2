import { isCountryCode } from "../../constants/countries.ts";

/** What a sign-in or sign-up field holds, which decides how it is checked. */
export type FieldKind =
  | "text"
  | "email"
  | "current-password"
  | "new-password"
  | "confirm-password"
  | "phone"
  | "date-of-birth"
  | "choice"
  | "country"
  | "postal-code";

/** Shortest password allowed when creating an account. */
export const MIN_PASSWORD_LENGTH = 12;

/** Youngest age allowed to create an account. */
export const MINIMUM_AGE = 13;

/**
 * The longest sign-up values the API accepts. Keep them in step with
 * server/src/constants/accountLimits.js.
 */
export const NAME_MAX_LENGTH = 50;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;
export const PHONE_MAX_LENGTH = 30;
export const ADDRESS_MAX_LENGTH = 200;
export const POSTAL_CODE_MAX_LENGTH = 10;

const EARLIEST_BIRTH_YEAR = 1900;
/** The API's email check (zod's z.email()), so both accept the same addresses. */
const EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CANADIAN_POSTAL_CODE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
const US_ZIP_CODE = /^\d{5}(-\d{4})?$/;
const ANY_POSTAL_CODE = /^[A-Z0-9][A-Z0-9 -]{1,9}$/i;
const TORONTO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface PasswordRule {
  id: string;
  label: string;
  message: string;
  test: (password: string) => boolean;
}

/** What a new password needs, in the order the messages are shown. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `${MIN_PASSWORD_LENGTH} or more characters`,
    message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    test: (password) => password.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: "lower",
    label: "A lowercase letter",
    message: "Add a lowercase letter.",
    test: (password) => /\p{Ll}/u.test(password),
  },
  {
    id: "upper",
    label: "An uppercase letter",
    message: "Add an uppercase letter.",
    test: (password) => /\p{Lu}/u.test(password),
  },
  {
    id: "numberOrSymbol",
    label: "A number or symbol",
    message: "Add a number or a symbol.",
    test: (password) => /[^\p{L}\s]/u.test(password),
  },
];

/**
 * Today's date in Toronto as YYYY-MM-DD, the day the API checks a date of birth against,
 * whatever time zone the device is in.
 *
 * @param now The moment to convert.
 * @returns The date, for example 2026-10-04.
 */
export function torontoToday(now = new Date()): string {
  return TORONTO_DATE.format(now);
}

function dateParts(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  const exists =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return exists ? { year, month, day } : null;
}

function dateOfBirthError(value: string, today: string): string {
  const birth = dateParts(value);
  const now = dateParts(today);
  if (!birth || !now || birth.year < EARLIEST_BIRTH_YEAR) {
    return "Enter a real date of birth.";
  }
  if (value > today) return "That date is in the future.";

  const beforeBirthday =
    now.month < birth.month ||
    (now.month === birth.month && now.day < birth.day);
  const age = now.year - birth.year - (beforeBirthday ? 1 : 0);
  return age < MINIMUM_AGE ? `You must be ${MINIMUM_AGE} or older.` : "";
}

function isPhoneNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "").length;
  return PHONE_CHARACTERS.test(value) && digits >= 7 && digits <= 15;
}

/**
 * Checks a postal code against the format of the chosen country.
 *
 * @param value The postal code, already trimmed.
 * @param country ISO 3166-1 alpha-2 code of the chosen country.
 * @returns The message to show, or an empty string when the postal code fits.
 */
export function postalCodeError(value: string, country: string): string {
  if (country === "CA") {
    return CANADIAN_POSTAL_CODE.test(value) ? "" : "Use the format A1A 1A1.";
  }
  if (country === "US") {
    return US_ZIP_CODE.test(value) ? "" : "Use the format 12345.";
  }
  return ANY_POSTAL_CODE.test(value) ? "" : "Enter a valid postal code.";
}

function emptyMessage(kind: FieldKind, label: string): string {
  if (kind === "choice") return "Choose an option.";
  if (kind === "country") return "Choose your country.";
  if (kind === "confirm-password") return "Re-enter your password.";
  return `Enter your ${label.toLowerCase()}.`;
}

/** What a field's check needs beyond its kind and value. */
export interface FieldCheckOptions {
  /**
   * The most characters the API accepts for the field, counted after trimming, except for a new
   * password, which is never trimmed.
   */
  maxLength?: number;
  /** Today's date in Toronto as YYYY-MM-DD, for the date of birth. */
  today?: string;
}

/**
 * Checks one field before a form moves on. This only helps the user; the server checks every
 * value again with the same rules and messages.
 *
 * @param kind What the field holds.
 * @param label The field's visible label, used in the "Enter your ..." message.
 * @param value The current value.
 * @param values Every value in the form, for checks that depend on another field, such as the
 *   postal code, which depends on the country, or the confirmed password, which must match.
 * @param options The field's length limit and today's date.
 * @returns The message to show under the field, or an empty string when the value is fine.
 */
export function fieldError(
  kind: FieldKind,
  label: string,
  value: string,
  values: Readonly<Record<string, string>> = {},
  options: FieldCheckOptions = {},
): string {
  const { maxLength, today = torontoToday() } = options;
  const trimmed = value.trim();
  if (!trimmed) return emptyMessage(kind, label);
  const length = kind === "new-password" ? value.length : trimmed.length;
  if (maxLength !== undefined && length > maxLength) {
    return `Use ${maxLength} characters or fewer.`;
  }

  switch (kind) {
    case "email":
      return EMAIL_PATTERN.test(trimmed)
        ? ""
        : "Enter an email address like name@example.com.";
    case "new-password":
      return PASSWORD_RULES.find((rule) => !rule.test(value))?.message ?? "";
    case "confirm-password":
      return value === values.password ? "" : "Passwords don't match.";
    case "phone":
      return isPhoneNumber(trimmed) ? "" : "Enter a valid phone number.";
    case "date-of-birth":
      return dateOfBirthError(trimmed, today);
    case "country":
      return isCountryCode(trimmed) ? "" : "Choose your country.";
    case "postal-code":
      return postalCodeError(trimmed, values.country ?? "");
    default:
      return "";
  }
}
