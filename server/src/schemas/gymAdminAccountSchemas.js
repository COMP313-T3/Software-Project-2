import { z } from "zod";
import { NAME_MAX_LENGTH, PHONE_MAX_LENGTH } from "../constants/accountLimits.js";
import { emailAddress, isPhoneNumber } from "./accountFields.js";
import { objectId, requiredText } from "./commonFields.js";

/** Params for the routes under /api/admin/gym-admins/:userId (US-007). */
export const gymAdminParamsSchema = z.object({
  userId: objectId("Gym Administrator"),
});

/** Params for /api/admin/gym-admins/:userId/gyms/:gymId, one gym the account can manage. */
export const gymAccessParamsSchema = gymAdminParamsSchema.extend({
  gymId: objectId("gym"),
});

/**
 * A phone number, or null to remove it. A Gym Administrator's phone is optional, so the field can
 * be sent empty to clear it.
 */
const phone = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  requiredText("phone number", PHONE_MAX_LENGTH)
    .refine(isPhoneNumber, { error: "Enter a valid phone number." })
    .nullable(),
);

/**
 * Fields a System Administrator can't change here, each with where it's changed instead. Sending
 * one is refused with that message, so the page never thinks it changed something it didn't.
 */
const lockedField = (message) => z.undefined({ error: message }).optional();

/**
 * Body of PATCH /api/admin/gym-admins/:userId (US-007 criterion 2): the account details a System
 * Administrator may correct. Text is trimmed and the email lowercased.
 *
 * The role, the password, and whether the account is active are never changed here: the role
 * stays GYM_ADMIN, only the account holder sets their password (through a reset link), and
 * access is changed with the deactivate, activate, and gym access routes. Other unknown keys are
 * dropped.
 */
export const updateGymAdminAccountSchema = z
  .object({
    firstName: requiredText("first name", NAME_MAX_LENGTH).optional(),
    lastName: requiredText("last name", NAME_MAX_LENGTH).optional(),
    email: emailAddress.optional(),
    phone: phone.optional(),
    role: lockedField("A Gym Administrator's role can't be changed."),
    isActive: lockedField("Use deactivate or activate to change whether the account can log in."),
    password: lockedField(
      "Only the account holder can set their password. They can use Forgot password.",
    ),
  })
  .refine(
    ({ firstName, lastName, email, phone: phoneNumber }) =>
      [firstName, lastName, email, phoneNumber].some((value) => value !== undefined),
    { error: "Change at least one account detail." },
  );
