import { z } from "zod";
import { NAME_MAX_LENGTH, PHONE_MAX_LENGTH } from "../constants/accountLimits.js";
import { GYM_LOCATION_MAX_LENGTH, GYM_NAME_MAX_LENGTH } from "../constants/gyms.js";
import {
  GYM_LOOKUP_SEARCH_MAX_LENGTH,
  GYM_REQUEST_DETAILS_MAX_LENGTH,
  GYM_REQUEST_JOB_TITLE_MAX_LENGTH,
  GYM_REQUEST_TYPE,
} from "../constants/gymRequests.js";
import { emailAddress, text } from "./accountFields.js";
import { objectId, optionalText, requiredText } from "./commonFields.js";
import { RECAPTCHA_REQUIRED_MESSAGE } from "./climberSignupSchema.js";

const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

/** The same phone rule as Climber sign-up: 7 to 15 digits, with spaces, dashes, dots, or brackets. */
function isPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").length;
  return (
    PHONE_CHARACTERS.test(value) &&
    digits >= MIN_PHONE_DIGITS &&
    digits <= MAX_PHONE_DIGITS
  );
}

/**
 * The applicant's contact details (US-034 criterion 3). The email is trimmed and lowercased, so the
 * one-pending-request-per-email rule can't be dodged by changing case.
 */
const contactFields = {
  firstName: text("first name", NAME_MAX_LENGTH),
  lastName: text("last name", NAME_MAX_LENGTH),
  email: emailAddress,
  phone: text("phone number", PHONE_MAX_LENGTH).refine(isPhoneNumber, {
    error: "Enter a valid phone number.",
  }),
  jobTitle: optionalText(GYM_REQUEST_JOB_TITLE_MAX_LENGTH),
  details: optionalText(GYM_REQUEST_DETAILS_MAX_LENGTH),
  recaptchaToken: z
    .string({ error: RECAPTCHA_REQUIRED_MESSAGE })
    .min(1, { error: RECAPTCHA_REQUIRED_MESSAGE }),
  website: z.unknown().optional(),
};

/**
 * Body of POST /api/gym-requests (US-034). The fields are flat, like the sign-up form, so each
 * error comes back under its own field name.
 *
 * requestType: NEW_GYM to register a gym that isn't on TopSend, or EXISTING_GYM to administer one
 *   that is (criterion 2).
 * NEW_GYM needs gymName and gymLocation; EXISTING_GYM needs gymId, chosen from
 *   GET /api/gym-requests/gyms. Fields for the other type are dropped.
 * jobTitle (such as Owner or Head Setter) and details are optional, to help the reviewer.
 * recaptchaToken is the robot check, and website is the hidden honeypot field.
 *
 * Keys that aren't listed are dropped, so the client can't set the status, an account, a role, or
 * who approved it.
 */
export const gymRequestSchema = z
  .discriminatedUnion(
    "requestType",
    [
      z.object({
        requestType: z.literal(GYM_REQUEST_TYPE.NEW_GYM),
        ...contactFields,
        gymName: requiredText("gym name", GYM_NAME_MAX_LENGTH),
        gymLocation: requiredText("gym address", GYM_LOCATION_MAX_LENGTH),
      }),
      z.object({
        requestType: z.literal(GYM_REQUEST_TYPE.EXISTING_GYM),
        ...contactFields,
        gymId: objectId("gym"),
      }),
    ],
    { error: "Choose whether your gym is new to TopSend or already registered." },
  )
  .transform((body) => ({
    requestType: body.requestType,
    contact: {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      jobTitle: body.jobTitle,
    },
    ...(body.requestType === GYM_REQUEST_TYPE.NEW_GYM
      ? { proposedGym: { name: body.gymName, location: body.gymLocation } }
      : { gymId: body.gymId }),
    details: body.details,
    recaptchaToken: body.recaptchaToken,
    website: body.website,
  }));

/** Query for GET /api/gym-requests/gyms: optional search text for the gym name or address. */
export const gymLookupQuerySchema = z.object({
  q: z
    .string({ error: "Enter search text." })
    .trim()
    .max(GYM_LOOKUP_SEARCH_MAX_LENGTH, {
      error: `Use ${GYM_LOOKUP_SEARCH_MAX_LENGTH} characters or fewer.`,
    })
    .optional(),
});
