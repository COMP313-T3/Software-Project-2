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
