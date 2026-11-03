import { Router } from "express";
import { registerClimber } from "../controllers/userController.js";
import { rejectSignUpHoneypot } from "../middleware/rejectHoneypot.js";
import { requireRecaptcha } from "../middleware/requireRecaptcha.js";
import { signupRateLimit } from "../middleware/signupRateLimit.js";
import { requireClimberRegistration } from "../middleware/requireClimberRegistration.js";
import { validateBody } from "../middleware/validateBody.js";
import { climberSignupSchema } from "../schemas/climberSignupSchema.js";

/**
 * Routes under /api/users. Sign-up runs the cheap checks first and asks Google about the
 * reCAPTCHA before it looks up the email, so bots can't use it to find registered emails.
 *
 * @param {{ recaptchaSecretKey?: string, signupLimitPerHour: number }} options Sign-up settings.
 * @returns {import("express").Router} The router.
 */
export function createUserRoutes({ recaptchaSecretKey, signupLimitPerHour }) {
  const router = Router();

  router.post(
    "/climbers",
    signupRateLimit(signupLimitPerHour),
    requireClimberRegistration,
    validateBody(climberSignupSchema),
    rejectSignUpHoneypot,
    requireRecaptcha(recaptchaSecretKey),
    registerClimber,
  );

  return router;
}
