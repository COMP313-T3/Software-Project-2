import * as onboardingService from "../services/onboardingService.js";

/**
 * GET /api/users/me/onboarding. Answers whether the logged-in user has seen the onboarding
 * tutorial (US-037).
 */
export async function getOnboarding(req, res) {
  res.json(await onboardingService.getOnboarding(req.auth.userId));
}

/**
 * PUT /api/users/me/onboarding. Records that the logged-in user finished or skipped the
 * onboarding tutorial. The user is always the one in the access token.
 */
export async function saveOnboarding(req, res) {
  res.json(await onboardingService.markOnboardingSeen(req.auth.userId));
}
