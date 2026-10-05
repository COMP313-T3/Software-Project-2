import { z } from "zod";
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../constants/accountLimits.js";

/**
 * zod's options for a field left empty: "Enter your <label>."
 *
 * @param {string} label The field's name in the message, such as "first name".
 */
export function required(label) {
  return { error: `Enter your ${label}.` };
}

/**
 * zod's options for a value that's too long.
 *
 * @param {number} maxLength The most characters allowed.
 */
export function tooLong(maxLength) {
  return { error: `Use ${maxLength} characters or fewer.` };
}

/**
 * Required text, trimmed.
 *
 * @param {string} label The field's name in the messages.
 * @param {number} maxLength The most characters allowed.
 */
export function text(label, maxLength) {
  return z
    .string(required(label))
    .trim()
    .min(1, required(label))
    .max(maxLength, tooLong(maxLength));
}

/** An email address, trimmed and lowercased. */
export const emailAddress = text("email", EMAIL_MAX_LENGTH)
  .toLowerCase()
  .pipe(z.email({ error: "Enter an email address like name@example.com." }));

/** A new password that follows the password rules. It's never trimmed. */
export const newPassword = z
  .string(required("password"))
  .refine((value) => value.trim().length > 0, required("password"))
  .min(PASSWORD_MIN_LENGTH, {
    error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, tooLong(PASSWORD_MAX_LENGTH))
  .refine((value) => /\p{Ll}/u.test(value), {
    error: "Add a lowercase letter.",
  })
  .refine((value) => /\p{Lu}/u.test(value), {
    error: "Add an uppercase letter.",
  })
  .refine((value) => /[^\p{L}\s]/u.test(value), {
    error: "Add a number or a symbol.",
  });
