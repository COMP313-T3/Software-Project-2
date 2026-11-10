/** The only division names there are, in the server's order (server/src/constants/divisions.js). */
export const DIVISION_NAMES = ["Open", "Beginner", "Youth", "Advanced"] as const;

export type DivisionName = (typeof DIVISION_NAMES)[number];
