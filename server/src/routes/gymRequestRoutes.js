import { Router } from "express";
import {
  GYM_ADMIN_SETUP_TRIES_PER_HOUR,
  GYM_LOOKUP_LIMIT_PER_HOUR,
  GYM_REQUEST_LIMIT_PER_HOUR,
} from "../constants/gymRequests.js";
import * as gymAdminSetupController from "../controllers/gymAdminSetupController.js";
import * as gymRequestController from "../controllers/gymRequestController.js";
import { hourlyRateLimit } from "../middleware/hourlyRateLimit.js";
import { rejectGymRequestHoneypot } from "../middleware/rejectHoneypot.js";
import { requireRecaptcha } from "../middleware/requireRecaptcha.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  gymAdminSetupLinkSchema,
  gymAdminSetupSchema,
} from "../schemas/gymRequestReviewSchemas.js";
import { gymLookupQuerySchema, gymRequestSchema } from "../schemas/gymRequestSchemas.js";

/**
 * Routes under /api/gym-requests, for Visitors who represent a climbing gym (US-034). They need no
 * login: a Visitor has no account yet, and submitting a request never creates one.
 *
 * GET /gyms: the registered gyms a Visitor can ask to administer, for the "existing gym" choice.
 * POST /: submits a new-gym registration or an existing-gym access request, saved as PENDING.
 *
 * Account setup for an approved applicant (US-035 criterion 6), opened from the emailed link:
 * POST /setup/check: checks the link and says whose account it sets up.
 * POST /setup: creates the GYM_ADMIN account with the chosen password and assigns it to the gym.
 * Both share one limit per IP address, like password reset links.
 *
 * Like Climber sign-up, a request runs the cheap checks first: a limit per IP address, the body
 * check, and the honeypot field. Google's reCAPTCHA check comes before anything is looked up, so
 * bots can't use the form to find out which emails or gyms are registered.
 *
 * @param {{ recaptchaSecretKey?: string }} options The reCAPTCHA secret key.
 * @returns {import("express").Router} The router.
 */
export function createGymRequestRoutes({ recaptchaSecretKey }) {
  const router = Router();

  router.get(
    "/gyms",
    hourlyRateLimit(GYM_LOOKUP_LIMIT_PER_HOUR, "Too many gym searches. Please try again later."),
    validateQuery(gymLookupQuerySchema),
    gymRequestController.listRegisteredGyms,
  );
  router.post(
    "/",
    hourlyRateLimit(
      GYM_REQUEST_LIMIT_PER_HOUR,
      "Too many gym requests from this network. Please try again later.",
    ),
    validateBody(gymRequestSchema),
    rejectGymRequestHoneypot,
    requireRecaptcha(recaptchaSecretKey),
    gymRequestController.submitGymRequest,
  );

  const setupTries = hourlyRateLimit(
    GYM_ADMIN_SETUP_TRIES_PER_HOUR,
    "Too many tries. Please try again later.",
  );
  router.post(
    "/setup/check",
    setupTries,
    validateBody(gymAdminSetupLinkSchema),
    gymAdminSetupController.checkLink,
  );
  router.post(
    "/setup",
    setupTries,
    validateBody(gymAdminSetupSchema),
    gymAdminSetupController.completeSetup,
  );

  return router;
}
