import { AppError } from "../utils/AppError.js";

/**
 * Lets a request through when authenticated role is allowed.
 *
 * @param {...string} roles Roles allowed
 * @returns {import("express").RequestHandler} Role check
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      throw new AppError(
        403,
        "ROLE_FORBIDDEN",
        "You don't have permission to access this resource.",
      );
    }
    next();
  };
}
