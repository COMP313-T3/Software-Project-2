import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/**
 * Stops a sign-up that filled in the hidden website field. People never see that field,
 * so only bots fill it. The message stays generic so it doesn't reveal the trap.
 *
 * @param {import("express").Request} req Request with a validated body.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Next middleware.
 */
export function rejectHoneypot(req, res, next) {
  if (req.body.website) {
    logger.warn("Sign-up blocked by the honeypot field", { requestId: req.id });
    throw new AppError(
      400,
      "SIGNUP_REJECTED",
      "We couldn't create your account. Refresh the page and try again.",
    );
  }
  next();
}
