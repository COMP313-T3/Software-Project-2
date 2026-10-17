/**
 * The scoring formats TopSend supports (US-018). Both can be worked out from the official result
 * fields in the spec (attempts, sends, flash), so result entry (US-019) needs nothing else.
 *
 * TOPS: most problems topped wins; ties go to fewer attempts on the topped problems.
 * POINTS: each topped problem earns its point value (US-016), plus an optional flash bonus;
 * ties go to more tops, then fewer attempts.
 */
export const SCORING_FORMAT = Object.freeze({
  TOPS: "TOPS",
  POINTS: "POINTS",
});

/** Every value allowed in a competition's scoring.format field. */
export const SCORING_FORMATS = Object.freeze(Object.values(SCORING_FORMAT));

/** What the Gym Admin chooses from (US-018 criterion 1), in the order the form shows them. */
export const SCORING_FORMAT_OPTIONS = Object.freeze([
  Object.freeze({
    format: SCORING_FORMAT.TOPS,
    label: "Tops and attempts",
    description:
      "The most problems topped wins. Ties go to whoever needed fewer attempts on those problems.",
    usesPointValues: false,
    allowsFlashBonus: false,
  }),
  Object.freeze({
    format: SCORING_FORMAT.POINTS,
    label: "Points",
    description:
      "Each topped problem earns its point value, plus an optional bonus for a flash. Ties go to more tops, then fewer attempts.",
    usesPointValues: true,
    allowsFlashBonus: true,
  }),
]);

/** The largest flash bonus a Points competition can award per problem. */
export const FLASH_BONUS_MAX = 1000;
