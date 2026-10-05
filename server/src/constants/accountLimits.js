/**
 * Limits for account fields, shared by the request checks and the User model.
 */
export const NAME_MAX_LENGTH = 50;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PHONE_MAX_LENGTH = 30;
export const ADDRESS_MAX_LENGTH = 200;
export const POSTAL_CODE_MAX_LENGTH = 10;

/** Youngest age allowed to create an account. Younger climbers get youth profiles from their gym. */
export const MINIMUM_AGE = 13;

/** Earliest birth year accepted, to catch typing mistakes. */
export const EARLIEST_BIRTH_YEAR = 1900;
