import {
  checkResetLink,
  resetPassword,
  sendPasswordResetLink,
} from "../services/passwordResetService.js";
import { AppError } from "../utils/AppError.js";
import { runInBackground } from "../utils/backgroundTasks.js";
import { logger } from "../utils/logger.js";

/**
 * Builds the password reset handlers.
 *
 * @param {{ mailer: import("../services/mailService.js").Mailer | null, appUrl: string }} options
 *   The mailer (null turns reset requests off) and the web app's address for the links.
 * @returns {Record<"forgotPassword" | "checkLink" | "resetPassword", import("express").RequestHandler>} The handlers.
 */
export function createPasswordResetHandlers({ mailer, appUrl }) {
  return {
    forgotPassword(req, res) {
      if (!mailer) {
        logger.error("Password reset asked for, but email is off", {
          requestId: req.id,
        });
        throw new AppError(
          503,
          "EMAIL_UNAVAILABLE",
          "Password reset isn't available right now. Please try again later.",
        );
      }

      // The answer goes out before the account is looked up, so it takes the same time whether
      // or not the email has an account.
      runInBackground(
        () => sendPasswordResetLink({ email: req.body.email, mailer, appUrl }),
        "Password reset email failed",
        { requestId: req.id },
      );
      res.status(202).json({ status: "requested" });
    },

    async checkLink(req, res) {
      res.json(await checkResetLink(req.body.token));
    },

    async resetPassword(req, res) {
      await resetPassword(req.body.token, req.body.password);
      res.json({ status: "reset" });
    },
  };
}
