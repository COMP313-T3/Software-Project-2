/** Limits for division fields, shared by the request checks and the Division model. */
export const DIVISION_NAME_MAX_LENGTH = 50;

/**
 * The divisions Create competition offers (US-012, US-014). A division only shows the expected
 * difficulty, so Open suits a competition for everyone. Divisions and climbers adds others with
 * any name.
 */
export const DIVISION_PRESETS = Object.freeze([
  "Open",
  "Beginner",
  "Intermediate",
  "Advanced",
]);
