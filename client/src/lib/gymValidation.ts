/** Letters from any language count, so international names and numbered addresses work. */
const LETTER = /\p{L}/u;

/** The API's messages for a gym name, location, or requested gym's address without a letter. */
const NO_LETTERS = {
  name: "Gym name must include letters, not only numbers or symbols.",
  location: "Location must include letters, not only numbers or symbols.",
  address: "Gym address must include letters, not only numbers or symbols.",
} as const;

/**
 * Checks that a gym's name or location includes a letter, the rule the Add gym, Edit gym, and
 * Register your gym forms share with the API, so it isn't only numbers or symbols. It can't tell
 * whether the gym is real.
 *
 * @param value The trimmed name or location.
 * @param field Which it is: address is the location on Register your gym.
 * @returns The message to show, or "" when it has a letter.
 */
export function gymLettersError(value: string, field: keyof typeof NO_LETTERS): string {
  return LETTER.test(value) ? "" : NO_LETTERS[field];
}
