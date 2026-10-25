/**
 * Roles stored on user accounts. The server always decides a user's role;
 * a role sent by the client is never trusted.
 */
export const ROLES = Object.freeze({
  ADMIN: "ADMIN",
  GYM_ADMIN: "GYM_ADMIN",
  CLIMBER: "CLIMBER",
});

/**
 * Every value allowed in a user's role field.
 */
export const ACCOUNT_ROLES = Object.freeze(Object.values(ROLES));

/**
 * The public, signed-out user. It is never stored as an account role.
 */
export const VISITOR = "VISITOR";
