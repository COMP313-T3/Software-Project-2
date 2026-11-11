import { Router } from "express";
import { getOnboarding, saveOnboarding } from "../controllers/onboardingController.js";
import { registerClimber } from "../controllers/userController.js";
import { rejectSignUpHoneypot } from "../middleware/rejectHoneypot.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRecaptcha } from "../middleware/requireRecaptcha.js";
import { signupRateLimit } from "../middleware/signupRateLimit.js";
import { requireClimberRegistration } from "../middleware/requireClimberRegistration.js";
import { validateBody } from "../middleware/validateBody.js";
import { climberSignupSchema } from "../schemas/climberSignupSchema.js";
import { onboardingSchema } from "../schemas/onboardingSchemas.js";

/**
 * Routes under /api/users. Sign-up runs the cheap checks first and asks Google about the
 * reCAPTCHA before it looks up the email, so bots can't use it to find registered emails.
 *
 * GET and PUT /me/onboarding read and record whether the logged-in user, of any role, has seen
 * the onboarding tutorial (US-037).
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, recaptchaSecretKey?: string, signupLimitPerHour: number }} options
 *   The login setup and the sign-up settings.
 * @returns {import("express").Router} The router.
 */
export function createUserRoutes({ auth, recaptchaSecretKey, signupLimitPerHour }) {
  const router = Router();

  router.get("/me/onboarding", requireAuth(auth), getOnboarding);
  router.put("/me/onboarding", requireAuth(auth), validateBody(onboardingSchema), saveOnboarding);

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
