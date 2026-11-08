import { z } from "zod";
import {
  ROUTE_ASSISTANT_MAX_FOCUS_ROUTES,
  ROUTE_ASSISTANT_QUESTION_MAX_LENGTH,
  ROUTE_ASSISTANT_QUESTION_MIN_LENGTH,
} from "../constants/routeAssistant.js";
import { objectId } from "./commonFields.js";

const QUESTION_MESSAGE = "Enter a question about how the routes performed.";
const QUESTION_LENGTH_MESSAGE = `Use ${ROUTE_ASSISTANT_QUESTION_MIN_LENGTH} to ${ROUTE_ASSISTANT_QUESTION_MAX_LENGTH} characters.`;
const ROUTES_MESSAGE = `Choose up to ${ROUTE_ASSISTANT_MAX_FOCUS_ROUTES} routes.`;
const OFFICIAL_DATA =
  "TopSend sends the competition's official statistics itself. Send only your question.";
const READ_ONLY =
  "The Route Assistant only explains statistics. It can't change scores, results, rankings or route grades.";

/** Letters from any language, so a question isn't only numbers or symbols. */
const LETTER = /\p{L}/u;
/** Control characters other than tabs and line breaks, which no typed question contains. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

/** A filter left empty, such as ?divisionId= from a cleared dropdown, counts as not chosen. */
function optionalFilter(schema) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

/**
 * A field a client can never send, with the reason. Sending one is refused, so nobody believes they
 * changed what the AI sees or what it can do.
 */
const lockedField = (message) => z.undefined({ error: message }).optional();

/**
 * The question, trimmed, with runs of spaces made single. Line breaks are kept, so a question typed
 * on several lines reads the same.
 */
const question = z
  .string({ error: QUESTION_MESSAGE })
  .transform((value) => value.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
  .pipe(
    z
      .string()
      .min(ROUTE_ASSISTANT_QUESTION_MIN_LENGTH, { error: QUESTION_LENGTH_MESSAGE })
      .max(ROUTE_ASSISTANT_QUESTION_MAX_LENGTH, { error: QUESTION_LENGTH_MESSAGE })
      .refine((value) => LETTER.test(value), { error: QUESTION_MESSAGE })
      .refine((value) => !CONTROL_CHARACTERS.test(value), {
        error: "Remove the special characters from your question.",
      }),
  );

/**
 * Body of POST /api/gym-admin/competitions/:competitionId/route-assistant (US-023).
 *
 * question: what the Gym Admin wants to know, such as "Which V4 was harder than we expected?".
 * divisionId: optional; only the results of Climbers in this division.
 * routeIds: optional; only these routes of the competition, up to ROUTE_ASSISTANT_MAX_FOCUS_ROUTES.
 *   Sent twice counts once.
 *
 * The statistics, the AI's instructions, and the model are never taken from the body: the server
 * reads the official statistics itself (FR-012, section 11 of the spec). Fields that would carry
 * them are refused with a reason, and other unknown keys are dropped.
 */
export const askRouteAssistantSchema = z.object({
  question,
  divisionId: optionalFilter(objectId("division")),
  routeIds: z
    .array(objectId("route"), { error: ROUTES_MESSAGE })
    .max(ROUTE_ASSISTANT_MAX_FOCUS_ROUTES, { error: ROUTES_MESSAGE })
    .transform((ids) => [...new Set(ids)])
    .optional(),
  statistics: lockedField(OFFICIAL_DATA),
  routes: lockedField(OFFICIAL_DATA),
  results: lockedField(OFFICIAL_DATA),
  data: lockedField(OFFICIAL_DATA),
  context: lockedField(OFFICIAL_DATA),
  system: lockedField(OFFICIAL_DATA),
  prompt: lockedField(OFFICIAL_DATA),
  model: lockedField(OFFICIAL_DATA),
  messages: lockedField(OFFICIAL_DATA),
  contents: lockedField(OFFICIAL_DATA),
  systemInstruction: lockedField(OFFICIAL_DATA),
  generationConfig: lockedField(OFFICIAL_DATA),
  tools: lockedField(READ_ONLY),
  toolConfig: lockedField(READ_ONLY),
  officialScore: lockedField(READ_ONLY),
  scores: lockedField(READ_ONLY),
  grade: lockedField(READ_ONLY),
  ranking: lockedField(READ_ONLY),
});

/** Query for GET .../route-assistant: optionally one division's statistics. */
export const routeAssistantQuerySchema = z.object({
  divisionId: optionalFilter(objectId("division")),
});
