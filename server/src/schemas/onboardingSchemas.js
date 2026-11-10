import { z } from "zod";

/**
 * Body of PUT /api/users/me/onboarding (US-037). The tutorial can only be marked as seen; nothing
 * in the body names a user, since the user is always the one in the access token.
 */
export const onboardingSchema = z.object({
  seen: z.literal(true, { error: "Send seen as true once the tutorial is finished or skipped." }),
});
