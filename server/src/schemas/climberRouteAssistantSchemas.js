import { z } from "zod";
import {
  CLIMBER_ASSISTANT_QUESTION_MAX_LENGTH,
  CLIMBER_ASSISTANT_QUESTION_MIN_LENGTH,
} from "../constants/climberRouteAssistant.js";

const QUESTION_MESSAGE = "Enter a question about the routes or your ranking.";
const QUESTION_LENGTH_MESSAGE = `Use ${CLIMBER_ASSISTANT_QUESTION_MIN_LENGTH} to ${CLIMBER_ASSISTANT_QUESTION_MAX_LENGTH} characters.`;
const OFFICIAL_DATA = "TopSend sends your official results and the standings itself. Send only your question.";
const READ_ONLY =
  "The Route Assistant only gives suggestions. It can't change scores, results, rankings or route grades.";

/** Letters from any language, so a question isn't only numbers or symbols. */
const LETTER = /\p{L}/u;

/** Whether text has a control character other than a tab or line break, which no typed question has. */
function hasControlCharacter(value) {
  for (const char of value) {
    const code = char.codePointAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true;
  }
  return false;
}

/** A field a client can never send, with the reason, so nobody believes it changed anything. */
const lockedField = (message) => z.undefined({ error: message }).optional();

/**
 * Body of POST /api/competitions/:competitionId/route-assistant (US-033).
 *
 * question: what the Climber wants to know, such as "Which route should I try next?". It's
 * trimmed, runs of spaces become one, and line breaks are kept.
 *
 * The Climber's results, the standings, the AI's instructions and the model are never taken from
 * the body: the server reads the official data itself. Fields that would carry them are refused
 * with a reason, and other unknown keys are dropped.
 */
export const askClimberAssistantSchema = z.object({
  question: z
    .string({ error: QUESTION_MESSAGE })
    .transform((value) => value.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(
      z
        .string()
        .min(CLIMBER_ASSISTANT_QUESTION_MIN_LENGTH, { error: QUESTION_LENGTH_MESSAGE })
        .max(CLIMBER_ASSISTANT_QUESTION_MAX_LENGTH, { error: QUESTION_LENGTH_MESSAGE })
        .refine((value) => LETTER.test(value), { error: QUESTION_MESSAGE })
        .refine((value) => !hasControlCharacter(value), {
          error: "Remove the special characters from your question.",
        }),
    ),
  results: lockedField(OFFICIAL_DATA),
  routes: lockedField(OFFICIAL_DATA),
  standings: lockedField(OFFICIAL_DATA),
  data: lockedField(OFFICIAL_DATA),
  context: lockedField(OFFICIAL_DATA),
  system: lockedField(OFFICIAL_DATA),
  prompt: lockedField(OFFICIAL_DATA),
  model: lockedField(OFFICIAL_DATA),
  messages: lockedField(OFFICIAL_DATA),
  contents: lockedField(OFFICIAL_DATA),
  climberId: lockedField(OFFICIAL_DATA),
  tools: lockedField(READ_ONLY),
  officialScore: lockedField(READ_ONLY),
  scores: lockedField(READ_ONLY),
  grade: lockedField(READ_ONLY),
  ranking: lockedField(READ_ONLY),
});
