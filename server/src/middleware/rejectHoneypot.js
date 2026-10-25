import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/**
 * Builds the check for a form's hidden website field. People never see that field, so only bots
 * fill it. The message stays generic so it doesn't reveal the trap.
 *
 * @param {{ form: string, code: string, message: string }} rejection The form's name for the log,
 *   and the error code and message to answer with.
 * @returns {import("express").RequestHandler} The middleware, for a request with a validated body.
 */
function createHoneypotCheck({ form, code, message }) {
  return function rejectHoneypot(req, res, next) {
    if (req.body.website) {
      logger.warn(`${form} blocked by the honeypot field`, { requestId: req.id });
      throw new AppError(400, code, message);
    }
    next();
  };
}

/** Stops a sign-up that filled in the hidden website field. */
export const rejectSignUpHoneypot = createHoneypotCheck({
  form: "Sign-up",
  code: "SIGNUP_REJECTED",
  message: "We couldn't create your account. Refresh the page and try again.",
});

/** Stops a gym registration or Gym Administrator access request that filled in the hidden field. */
export const rejectGymRequestHoneypot = createHoneypotCheck({
  form: "Gym request",
  code: "GYM_REQUEST_REJECTED",
  message: "We couldn't send your request. Refresh the page and try again.",
});
