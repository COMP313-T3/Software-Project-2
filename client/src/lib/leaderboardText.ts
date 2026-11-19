/** The id of the logged-in Climber's row on the leaderboard, so "Show my row" can find it (US-032). */
export const MY_ROW_ID = "my-standing-row";

const ORDINAL_RULES = new Intl.PluralRules("en-CA", { type: "ordinal" });
const ORDINAL_SUFFIXES: Record<Intl.LDMLPluralRule, string> = { zero: "th", one: "st", two: "nd", few: "rd", many: "th", other: "th" };

/**
 * A place as it's said in English: 1st, 2nd, 3rd, 4th, 11th, 21st.
 *
 * @param place A place on the leaderboard, from 1.
 */
export function ordinal(place: number) {
  return `${place}${ORDINAL_SUFFIXES[ORDINAL_RULES.select(place)]}`;
}

/**
 * A number of points, as "1 point" or "20 points".
 *
 * @param count The points.
 */
export function pointsText(count: number) {
  return `${count} ${count === 1 ? "point" : "points"}`;
}
