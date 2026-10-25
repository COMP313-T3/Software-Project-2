import { verifyRecaptchaToken } from "../services/recaptchaService.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

const SECRET_KEY_ERRORS = new Set([
  "missing-input-secret",
  "invalid-input-secret",
]);
const FAILED_MESSAGE =
  "The reCAPTCHA check didn't go through. Check the box again.";

function unavailable() {
  return new AppError(
    503,
    "RECAPTCHA_UNAVAILABLE",
    "We couldn't check the reCAPTCHA right now. Please try again in a moment.",
  );
}

/**
 * Lets a request through only when Google confirms its reCAPTCHA token. If the check
 * can't be completed, the request fails instead of skipping it.
 *
 * @param {string | undefined} secretKey The reCAPTCHA secret key.
 * @returns {import("express").RequestHandler} The middleware.
 */
export function requireRecaptcha(secretKey) {
  return async (req, res, next) => {
    if (!secretKey) {
      logger.error("RECAPTCHA_SECRET_KEY is not set", { requestId: req.id });
      throw unavailable();
    }

    let result;
    try {
      result = await verifyRecaptchaToken(secretKey, req.body.recaptchaToken);
    } catch (error) {
      logger.error("reCAPTCHA verification failed", {
        requestId: req.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw unavailable();
    }

    if (result.errorCodes.some((code) => SECRET_KEY_ERRORS.has(code))) {
      logger.error("reCAPTCHA rejected the secret key", {
        requestId: req.id,
        errorCodes: result.errorCodes,
      });
      throw unavailable();
    }
    if (!result.success) {
      logger.warn("reCAPTCHA check failed", {
        requestId: req.id,
        errorCodes: result.errorCodes,
      });
      throw new AppError(400, "RECAPTCHA_FAILED", FAILED_MESSAGE, {
        recaptchaToken: FAILED_MESSAGE,
      });
    }
    next();
  };
}
