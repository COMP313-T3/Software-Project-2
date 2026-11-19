import { z } from "zod";
import {
  ASSISTANT_HISTORY_MAX_SENT,
  ASSISTANT_HISTORY_MAX_USED,
  ASSISTANT_HISTORY_ROLES,
  ASSISTANT_HISTORY_TEXT_MAX_SENT,
  ASSISTANT_HISTORY_TEXT_MAX_USED,
} from "../constants/assistantChat.js";

const HISTORY_MESSAGE = "Send the earlier messages of this conversation as a list of { role, text }.";
const HISTORY_TOO_LONG = `Send up to ${ASSISTANT_HISTORY_MAX_SENT} earlier messages.`;

/** Control characters other than tabs and line breaks, which no typed or generated message needs. */
function withoutControlCharacters(value) {
  let text = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) continue;
    text += char;
  }
  return text;
}

/**
 * The page the chatbot was opened on, one of the role's pages. Left out, it's the first of them,
 * so a request from before pages existed still means what it meant.
 *
 * @param {readonly string[]} pages The pages the role's chatbot is on.
 * @returns {import("zod").ZodType<string>} The field.
 */
export function assistantPage(pages) {
  const message = `Choose the page the question is asked from: ${pages.join(", ")}.`;
  return z.enum(pages, { error: message }).default(pages[0]);
}

/**
 * The earlier messages of the conversation on the page, oldest first, so a follow-up question makes
 * sense. They are only ever text: the service places them in the AI's data, next to the question,
 * never as instructions and never as the AI's own earlier turns. The last
 * ASSISTANT_HISTORY_MAX_USED are kept, each cut to ASSISTANT_HISTORY_TEXT_MAX_USED characters, and
 * a message that is empty once trimmed is dropped. Keys other than role and text are dropped.
 */
export const assistantHistory = z
  .array(
    z.object(
      {
        role: z.enum(ASSISTANT_HISTORY_ROLES, { error: HISTORY_MESSAGE }),
        text: z.string({ error: HISTORY_MESSAGE }).max(ASSISTANT_HISTORY_TEXT_MAX_SENT, { error: HISTORY_MESSAGE }),
      },
      { error: HISTORY_MESSAGE },
    ),
    { error: HISTORY_MESSAGE },
  )
  .max(ASSISTANT_HISTORY_MAX_SENT, { error: HISTORY_TOO_LONG })
  .default([])
  .transform((messages) =>
    messages
      .map(({ role, text }) => ({
        role,
        text: withoutControlCharacters(text).trim().slice(0, ASSISTANT_HISTORY_TEXT_MAX_USED).trimEnd(),
      }))
      .filter((message) => message.text !== "")
      .slice(-ASSISTANT_HISTORY_MAX_USED),
  );
