/** Limits for division fields, shared by the request checks and the Division model. */
export const DIVISION_NAME_MAX_LENGTH = 50;

/**
 * The only names a division can be created with, on Create competition and on Divisions and
 * climbers (US-012, US-014). A division only shows who the category is meant for, so Open suits a
 * competition for everyone. A division saved earlier under another name keeps working, but no new
 * one can be created with it.
 */
export const DIVISION_NAMES = Object.freeze(["Open", "Beginner", "Youth", "Advanced"]);

/**
 * The division name a request means, whatever its case or the spaces around it, or the value as
 * it was sent when it isn't one of DIVISION_NAMES.
 *
 * @param {unknown} value The name from the request.
 * @returns {unknown} The name as DIVISION_NAMES spells it, or value.
 */
export function divisionNameOf(value) {
  if (typeof value !== "string") return value;
  const wanted = value.trim().toLowerCase();
  return DIVISION_NAMES.find((name) => name.toLowerCase() === wanted) ?? value;
}
