/**
 * Roles stored on user accounts. The server decides a user's role; the app only reads it.
 */
export const ROLES = {
  ADMIN: "ADMIN",
  GYM_ADMIN: "GYM_ADMIN",
  CLIMBER: "CLIMBER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * The public, signed-out user. It is never stored as an account role.
 */
export const VISITOR = "VISITOR";
