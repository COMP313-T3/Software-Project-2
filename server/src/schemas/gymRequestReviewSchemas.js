import { z } from "zod";
import {
  GYM_REQUEST_DECISION,
  GYM_REQUEST_LIST_ALL,
  GYM_REQUEST_REJECTION_REASON_MAX_LENGTH,
  GYM_REQUEST_STATUS,
  GYM_REQUEST_STATUSES,
  GYM_REQUEST_TYPES,
} from "../constants/gymRequests.js";
import { newPassword } from "./accountFields.js";
import { limit, objectId, optionalText, page } from "./commonFields.js";


const STATUS_MESSAGE = `Choose a status: ${[...GYM_REQUEST_STATUSES, GYM_REQUEST_LIST_ALL].join(", ")}.`;
const TYPE_MESSAGE = `Choose a request type: ${GYM_REQUEST_TYPES.join(", ")}.`;
const DECISION_MESSAGE = "Choose APPROVE or REJECT.";

/**
 * Query for GET /api/admin/gym-requests (US-035 criterion 1). Shows PENDING requests unless
 * another status, or ALL, is asked for. requestType narrows it to NEW_GYM or EXISTING_GYM.
 */
export const listGymRequestsQuerySchema = z.object({
  status: z
    .enum([...GYM_REQUEST_STATUSES, GYM_REQUEST_LIST_ALL], { error: STATUS_MESSAGE })
    .default(GYM_REQUEST_STATUS.PENDING),
  requestType: z.enum(GYM_REQUEST_TYPES, { error: TYPE_MESSAGE }).optional(),
  page,
  limit,
});

/** Params for the routes under /api/admin/gym-requests/:requestId. */
export const gymRequestParamsSchema = z.object({
  requestId: objectId("request"),
});

/**
 * Body of PATCH /api/admin/gym-requests/:requestId/review (US-035 criterion 3).
 *
 * decision: APPROVE or REJECT.
 * reason: optional, only for REJECT, and emailed to the applicant. It's dropped for APPROVE.
 *
 * Who reviewed it and when are always set by the server, never taken from the body.
 */
export const reviewGymRequestSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({ decision: z.literal(GYM_REQUEST_DECISION.APPROVE) }),
    z.object({
      decision: z.literal(GYM_REQUEST_DECISION.REJECT),
      reason: optionalText(GYM_REQUEST_REJECTION_REASON_MAX_LENGTH),
    }),
  ],
  { error: DECISION_MESSAGE },
);

const LINK_MESSAGE = "Open the setup link from your email again.";
const TOKEN_MAX_LENGTH = 128;

const token = z
  .string({ error: LINK_MESSAGE })
  .min(1, { error: LINK_MESSAGE })
  .max(TOKEN_MAX_LENGTH, { error: LINK_MESSAGE });

/** Body of POST /api/gym-requests/setup/check: the token from the setup link. */
export const gymAdminSetupLinkSchema = z.object({ token });

/**
 * Body of POST /api/gym-requests/setup (US-035 criterion 6): the token from the setup link and the
 * new account's password, which follows the sign-up rules. The name, email, and phone come from
 * the approved request, so they can't be changed here.
 */
export const gymAdminSetupSchema = z.object({ token, password: newPassword });
