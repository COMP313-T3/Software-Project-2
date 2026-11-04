import { z } from "zod";
import { SCORING_ATTEMPTS_MAX } from "../constants/scoring.js";
import { limit, objectId, page } from "./commonFields.js";
import { climberParamsSchema } from "./divisionSchemas.js";

const ATTEMPTS_MESSAGE = `Enter a whole number of attempts from 0 to ${SCORING_ATTEMPTS_MAX}.`;
const SENT_MESSAGE = "Choose whether the Climber sent the problem.";
const FLASH_MESSAGE = "Choose whether the send was a flash.";
const NEEDS_AN_ATTEMPT = "A send needs at least one attempt.";
const FLASH_IS_FIRST_TRY = "A flash is a send on the first attempt.";

/** Params for one Climber's result on one problem: .../climbers/:climberId/routes/:routeId. */
export const resultParamsSchema = climberParamsSchema.extend({
  routeId: objectId("route"),
});

/**
 * A field a client can never set, with the reason. Sending one is refused with that message, so
 * nobody believes they changed something they didn't.
 *
 * @param {string} message Why the field can't be sent.
 */
const lockedField = (message) => z.undefined({ error: message }).optional();

const SCORE_IS_CALCULATED =
  "TopSend calculates the official score from the competition's scoring rules. Send the attempts and whether it was sent.";

/** Fields of an official result that only the server sets (US-019 criteria 6 and 7). */
const serverFields = {
  officialScore: lockedField(SCORE_IS_CALCULATED),
  sends: lockedField('Send "sent": true or false instead.'),
  source: lockedField("Official results are always recorded by a Gym Administrator."),
  createdBy: lockedField("TopSend records who saved the result."),
  updatedBy: lockedField("TopSend records who saved the result."),
};

/** The number of attempts. Forms often send numbers as text, so "3" is accepted as 3. */
const attempts = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
  z
    .number({ error: ATTEMPTS_MESSAGE })
    .int({ error: ATTEMPTS_MESSAGE })
    .min(0, { error: ATTEMPTS_MESSAGE })
    .max(SCORING_ATTEMPTS_MAX, { error: ATTEMPTS_MESSAGE }),
);

/**
 * Rules that compare the fields, checked once each field is valid on its own: a send needs an
 * attempt, and a flash is exactly a send on the first attempt. A flash left out is worked out
 * from the other two.
 */
function checkSendAndFlash(result, ctx) {
  if (typeof result.attempts !== "number" || typeof result.sent !== "boolean") return;
  if (result.sent && result.attempts === 0) {
    ctx.addIssue({ code: "custom", path: ["attempts"], message: NEEDS_AN_ATTEMPT });
    return;
  }
  if (result.flash === true && !result.sent) {
    ctx.addIssue({
      code: "custom",
      path: ["flash"],
      message: `${FLASH_IS_FIRST_TRY} Mark it as sent too.`,
    });
  } else if (result.flash === true && result.attempts !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["flash"],
      message: `${FLASH_IS_FIRST_TRY} Set attempts to 1, or leave flash off.`,
    });
  } else if (result.flash === false && result.sent && result.attempts === 1) {
    ctx.addIssue({
      code: "custom",
      path: ["flash"],
      message: "A send on the first attempt is a flash. Leave flash out, or set attempts above 1.",
    });
  }
}

/**
 * Body of PUT .../climbers/:climberId/routes/:routeId/result (US-019 criteria 3 to 5): the whole
 * result, which replaces any saved one, such as when a judge corrects a scorecard.
 *
 * attempts: attempts on the problem, up to and including the top. It can't go above the
 *   competition's maxAttempts, which the server checks.
 * sent: whether the Climber topped it.
 * flash: optional; a send on the first attempt. Left out, it's worked out from the other two.
 *
 * The official score, and who saved it, are never taken from the body (criteria 6 and 7).
 */
export const saveResultSchema = z
  .object({
    attempts,
    sent: z.boolean({ error: SENT_MESSAGE }),
    flash: z.boolean({ error: FLASH_MESSAGE }).optional(),
    ...serverFields,
  })
  .superRefine(checkSendAndFlash);

/**
 * Body of POST .../climbers/:climberId/routes/:routeId/attempts (US-019 criterion 3): one more
 * attempt, as a judge records it at the wall.
 *
 * sent: true when this attempt topped the problem. Left out, it's an attempt without a top.
 * flash: optional, as above. A top on the first attempt is a flash either way.
 */
export const recordAttemptSchema = z
  .object({
    sent: z.boolean({ error: SENT_MESSAGE }).default(false),
    flash: z.boolean({ error: FLASH_MESSAGE }).optional(),
    ...serverFields,
  })
  .superRefine((attempt, ctx) => {
    if (attempt.flash === true && attempt.sent !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["flash"],
        message: `${FLASH_IS_FIRST_TRY} Mark it as sent too.`,
      });
    }
  });