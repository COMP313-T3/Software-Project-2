/**
 * Answers to the gender question at sign-up. Prefer not to say is always available.
 */
export const GENDERS = Object.freeze({
  MALE: "MALE",
  FEMALE: "FEMALE",
  PREFER_NOT_TO_SAY: "PREFER_NOT_TO_SAY",
});

/**
 * Every value allowed in a user's gender field.
 */
export const GENDER_VALUES = Object.freeze(Object.values(GENDERS));
