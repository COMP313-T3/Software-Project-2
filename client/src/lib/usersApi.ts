import { apiRequest } from "./apiClient.ts";
import type { LatLngLiteral } from "./googleMaps.ts";

/** What the create account form sends to POST /api/users/climbers. */
export interface ClimberSignup {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
  gender: string;
  phone: string;
  address: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 code, such as CA. */
  country: string;
  /** The map pin, when one was chosen. */
  location?: LatLngLiteral;
  acceptedTerms: true;
  recaptchaToken: string;
  /** The hidden honeypot field. People leave it empty. */
  website: string;
}

/** The API's answer when a climber account is created. */
export interface ClimberCreated {
  userId: string;
  status: "created";
  role: "CLIMBER";
}

/**
 * Creates a climber account.
 *
 * @param signup The form's values, the Terms agreement, and the reCAPTCHA token.
 * @returns The new account's ID and role.
 * @throws {ApiError} With a message per field when the API rejects a value, for example an email that already has an account.
 */
export function createClimberAccount(
  signup: ClimberSignup,
): Promise<ClimberCreated> {
  return apiRequest<ClimberCreated>("/api/users/climbers", {
    method: "POST",
    body: signup,
  });
}
