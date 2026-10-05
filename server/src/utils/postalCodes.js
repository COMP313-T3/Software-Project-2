const CANADA = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;
const UNITED_STATES = /^\d{5}(-\d{4})?$/;
const ANY_COUNTRY = /^[A-Z0-9][A-Z0-9 -]{1,9}$/;

/**
 * Checks a postal code against its country's format and tidies it up. Canadian codes come back
 * as A1A 1A1 and US codes as 12345 or 12345-6789; other countries only get a loose check.
 *
 * @param {string} value The postal code as typed.
 * @param {string} countryCode ISO 3166-1 alpha-2 country code.
 * @returns {string | null} The tidied postal code, or null when it doesn't fit the format.
 */
export function normalizePostalCode(value, countryCode) {
  const upper = value.trim().toUpperCase().replace(/\s+/g, " ");

  if (countryCode === "CA") {
    const compact = upper.replace(/[\s-]/g, "");
    return CANADA.test(compact)
      ? `${compact.slice(0, 3)} ${compact.slice(3)}`
      : null;
  }
  if (countryCode === "US") return UNITED_STATES.test(upper) ? upper : null;
  return ANY_COUNTRY.test(upper) ? upper : null;
}

/**
 * The message for a postal code that doesn't fit its country's format.
 *
 * @param {string} countryCode ISO 3166-1 alpha-2 country code.
 * @returns {string} The message.
 */
export function postalCodeMessage(countryCode) {
  if (countryCode === "CA") return "Use the format A1A 1A1.";
  if (countryCode === "US") return "Use the format 12345.";
  return "Enter a valid postal code.";
}
