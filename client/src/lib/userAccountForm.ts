import { ADDRESS_MAX_LENGTH, EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, PHONE_MAX_LENGTH, POSTAL_CODE_MAX_LENGTH, fieldError, type FieldKind } from "../components/auth/authValidation.ts";
import { GENDER_OPTIONS } from "../constants/genders.ts";
import type { UserDetails } from "./userAdminApi.ts";
import type { UserProfileChanges } from "./userAccountApi.ts";

export const USER_PROFILE_FIELDS = [
  { name: "firstName", label: "First name", kind: "text", maxLength: NAME_MAX_LENGTH },
  { name: "lastName", label: "Last name", kind: "text", maxLength: NAME_MAX_LENGTH },
  { name: "email", label: "Email", kind: "email", maxLength: EMAIL_MAX_LENGTH },
  { name: "phone", label: "Phone", kind: "phone", maxLength: PHONE_MAX_LENGTH },
  { name: "dateOfBirth", label: "Date of birth", kind: "date-of-birth" },
  { name: "gender", label: "Gender", kind: "choice" },
  { name: "address", label: "Address", kind: "text", maxLength: ADDRESS_MAX_LENGTH },
  { name: "country", label: "Country", kind: "country" },
  { name: "postalCode", label: "Postal code", kind: "postal-code", maxLength: POSTAL_CODE_MAX_LENGTH },
] as const satisfies readonly { name: keyof UserProfileChanges; label: string; kind: FieldKind; maxLength?: number }[];
export type UserProfileField = (typeof USER_PROFILE_FIELDS)[number]["name"];
export type UserProfileDraft = Record<UserProfileField, string> & { clearLocation: boolean };
export type UserProfileErrors = Partial<Record<UserProfileField, string>>;

export function profileDraft(account: UserDetails): UserProfileDraft {
  return {
    firstName: account.firstName ?? "", lastName: account.lastName ?? "", email: account.email ?? "", phone: account.phone ?? "",
    dateOfBirth: account.climber?.dateOfBirth ?? "", gender: account.climber?.gender ?? "", address: account.climber?.address ?? "",
    country: account.climber?.country ?? "", postalCode: account.climber?.postalCode ?? "", clearLocation: false,
  };
}
export const editableUserFields = (account: UserDetails) => USER_PROFILE_FIELDS.filter((_, index) => index < 4 || account.role === "CLIMBER");
const normalize = (field: UserProfileField, value: string) => field === "email" ? value.trim().toLowerCase() : ["country", "postalCode"].includes(field) ? value.trim().toUpperCase() : value.trim();

/** Validate only changed fields, including the postal-code/country pair, and preserve all other data. */
export function prepareUserChanges(account: UserDetails, draft: UserProfileDraft): { changes: UserProfileChanges; errors: UserProfileErrors } {
  const original = profileDraft(account), changes: UserProfileChanges = {}, errors: UserProfileErrors = {};
  const country = normalize("country", draft.country);
  for (const definition of editableUserFields(account)) {
    const { name, kind, label } = definition;
    const value = normalize(name, draft[name]);
    if (value === normalize(name, original[name])) continue;
    const problem = fieldError(kind, label, value, { country }, { maxLength: "maxLength" in definition ? definition.maxLength : undefined });
    if (problem) errors[name] = problem;
    if (name === "gender" && !GENDER_OPTIONS.some(option => option.value === value)) errors.gender = "Choose an option.";
    Object.assign(changes, { [name]: value });
  }
  if (account.role === "CLIMBER" && changes.country !== undefined && draft.postalCode.trim()) {
    const problem = fieldError("postal-code", "Postal code", draft.postalCode, { country }, { maxLength: POSTAL_CODE_MAX_LENGTH });
    if (problem) errors.postalCode = problem;
  }
  if (account.role === "CLIMBER" && account.climber?.hasSavedLocation && draft.clearLocation) changes.location = null;
  return { changes, errors };
}
export const canDeactivateUser = (account: UserDetails, actorId: string) => account.isActive === true && ["CLIMBER", "GYM_ADMIN"].includes(account.role) && account._id.toLowerCase() !== actorId.toLowerCase();
