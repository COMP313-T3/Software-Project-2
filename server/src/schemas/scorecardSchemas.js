import { z } from "zod";
import { SCORING_ATTEMPTS_MAX } from "../constants/scoring.js";
import { objectId } from "./commonFields.js";
import { competitionIdParamsSchema } from "./gymAdminSchemas.js";

const ATTEMPTS_MESSAGE = `Enter a whole number of attempts from 1 to ${SCORING_ATTEMPTS_MAX}.`;

/** Params for the Climber's own result on one problem: .../scorecard/routes/:routeId/result. */
export const scorecardResultParamsSchema = competitionIdParamsSchema.extend({
  routeId: objectId("route"),
});

/**
 * Body of PUT /api/competitions/:competitionId/scorecard/routes/:routeId/result (US-031): the
 * Climber's whole result on the problem, which replaces any saved one.
 *
 * attempts: attempts on the problem, up to and including the top. It can't go above the
 *   competition's maxAttempts, which the server checks.
 * sent: whether the last attempt topped it.
 *
 * Nothing else is accepted: the Climber always comes from the access token, and the flash and the
 * score are worked out by the server.
 */
export const ownResultSchema = z
  .object({
    attempts: z
      .number({ error: ATTEMPTS_MESSAGE })
      .int({ error: ATTEMPTS_MESSAGE })
      .min(1, { error: ATTEMPTS_MESSAGE })
      .max(SCORING_ATTEMPTS_MAX, { error: ATTEMPTS_MESSAGE }),
    sent: z.boolean({ error: "Choose whether you sent the problem." }),
  })
  .strict();
