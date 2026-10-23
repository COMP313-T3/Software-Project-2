/** Keep the form limit aligned with server/src/constants/divisions.js. */
export const DIVISION_NAME_MAX_LENGTH = 50;

/** The divisions Create competition offers, in the server's order (DIVISION_PRESETS). */
export const DIVISION_PRESETS = ["Open", "Beginner", "Intermediate", "Advanced"] as const;

export type DivisionPreset = (typeof DIVISION_PRESETS)[number];
