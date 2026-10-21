import type { GymRequestContact, GymRequestType } from "./gymRequestApi.ts";

export interface GymRequestValues extends GymRequestContact {
  requestType: GymRequestType; gymName: string; gymLocation: string; gymId: string;
}
export type GymRequestErrors = Partial<Record<keyof GymRequestValues | "recaptchaToken", string>>;

/** Matches the contact and gym limits in the US034 backend schema. */
export function validateGymRequest(values: GymRequestValues, token: string): GymRequestErrors {
  const errors: GymRequestErrors = {};
  for (const [key, label, limit] of [
    ["firstName", "first name", 50], ["lastName", "last name", 50],
    ["email", "email", 254], ["phone", "phone number", 30],
    ...(values.requestType === "NEW_GYM" ? [["gymName", "gym name", 100], ["gymLocation", "gym address", 200]] : []),
  ] as [keyof GymRequestValues, string, number][]) {
    if (!values[key].trim()) errors[key] = `Enter your ${label}.`;
    else if (values[key].trim().length > limit) errors[key] = `Use ${limit} characters or fewer.`;
  }
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  const phone = values.phone.trim(); const digits = phone.replace(/\D/g, "").length;
  if (phone && (!/^\+?[\d\s().-]+$/.test(phone) || digits < 7 || digits > 15)) errors.phone = "Enter a valid phone number (7 to 15 digits).";
  if (values.jobTitle.trim().length > 100) errors.jobTitle = "Use 100 characters or fewer.";
  if (values.details.trim().length > 1000) errors.details = "Use 1000 characters or fewer.";
  if (values.requestType === "EXISTING_GYM" && !/^[a-f\d]{24}$/i.test(values.gymId)) errors.gymId = "Choose your gym from the results.";
  if (!token) errors.recaptchaToken = "Complete the robot check before submitting.";
  return errors;
}
