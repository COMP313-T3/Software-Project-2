import { Router } from "express";
import { createAuthHandlers } from "../controllers/authController.js";
import { createPasswordResetHandlers } from "../controllers/passwordResetController.js";
import { hourlyRateLimit } from "../middleware/hourlyRateLimit.js";
import { loginRateLimit } from "../middleware/loginRateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validateBody.js";
import { loginSchema } from "../schemas/loginSchemas.js";
import {
  forgotPasswordSchema,
  resetLinkSchema,
  resetPasswordSchema,
} from "../schemas/passwordResetSchemas.js";

/**
 * Routes under /api/auth.
 *
 * Login: GET /csrf hands out the CSRF token that POST /login, POST /refresh, and POST /logout
 * need in the X-CSRF-Token header, since those rely on the refresh cookie. GET /me needs the
 * access token. Failed logins are limited per IP address.
 *
 * Password reset: requests for a link are limited per IP address and, once the body is checked,
 * per email. Opening a link and saving the new password share one limit per IP address.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, mailer: import("../services/mailService.js").Mailer | null, appUrl: string, passwordResetLimits: { requestsPerEmailPerHour: number, requestsPerIpPerHour: number, linkTriesPerIpPerHour: number } }} options
 *   The login setup, the mailer, the web app's address for links in emails, and the reset limits.
 * @returns {import("express").Router} The router.
 */
export function createAuthRoutes({
  auth,
  mailer,
  appUrl,
  passwordResetLimits,
}) {
  const router = Router();
  const { login, refresh, logout, me } = createAuthHandlers(auth);
  const { forgotPassword, checkLink, resetPassword } =
    createPasswordResetHandlers({ mailer, appUrl });
  const linkTries = hourlyRateLimit(
    passwordResetLimits.linkTriesPerIpPerHour,
    "Too many tries. Please try again later.",
  );

  router.get("/csrf", auth.csrf.sendToken);
  router.post(
    "/login",
    loginRateLimit(auth.loginLimits.failuresPerIpPer15Minutes),
    auth.csrf.requireToken,
    validateBody(loginSchema),
    login,
  );
  router.post("/refresh", auth.csrf.requireToken, refresh);
  router.post("/logout", auth.csrf.requireToken, logout);
  router.get("/me", requireAuth(auth), me);

  router.post(
    "/forgot-password",
    hourlyRateLimit(
      passwordResetLimits.requestsPerIpPerHour,
      "Too many reset requests. Please try again later.",
    ),
    validateBody(forgotPasswordSchema),
    hourlyRateLimit(
      passwordResetLimits.requestsPerEmailPerHour,
      "Too many reset requests for this email. Please try again later.",
      (req) => req.body.email,
    ),
    forgotPassword,
  );
  router.post(
    "/reset-password/check",
    linkTries,
    validateBody(resetLinkSchema),
    checkLink,
  );
  router.post(
    "/reset-password",
    linkTries,
    validateBody(resetPasswordSchema),
    resetPassword,
  );

  return router;
}
