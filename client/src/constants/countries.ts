/**
 * ISO 3166-1 alpha-2 codes for every country and territory. Sign-up sends one of these. Keep it
 * in step with the API's copy in server/src/constants/countries.js.
 */
export const COUNTRY_CODES: readonly string[] = Object.freeze(
  `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE
   BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD
   CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM
   DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF
   GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU
   ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN
   KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME
   MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
   NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM
   PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI
   SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK
   TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI
   VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/),
);

/** The country picked when the form opens. TopSend is for Toronto, so Canada comes first. */
export const DEFAULT_COUNTRY = "CA";

export interface CountryOption {
  code: string;
  name: string;
}

const KNOWN_CODES = new Set(COUNTRY_CODES);

/**
 * Every country with its English name from the browser, Canada first and the rest A to Z.
 */
export const COUNTRY_OPTIONS: readonly CountryOption[] = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const collator = new Intl.Collator("en");
  const options = COUNTRY_CODES.map((code) => ({
    code,
    name: names.of(code) ?? code,
  }));
  const first = options.filter((option) => option.code === DEFAULT_COUNTRY);
  const rest = options
    .filter((option) => option.code !== DEFAULT_COUNTRY)
    .sort((a, b) => collator.compare(a.name, b.name));
  return Object.freeze([...first, ...rest]);
})();

/**
 * Whether a value is one of the country codes above.
 *
 * @param code The value to check.
 * @returns True for a known country code.
 */
export function isCountryCode(code: string): boolean {
  return KNOWN_CODES.has(code);
}
