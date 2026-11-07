import {
  ANTHROPIC_API_URL,
  ANTHROPIC_API_VERSION,
  ANTHROPIC_DEFAULT_EFFORT,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_TIMEOUT_MS,
  ROUTE_ASSISTANT_ANSWER_MAX_LENGTH,
} from "../constants/routeAssistant.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/** Blocks the model may return besides its answer: its thinking, which isn't shown. */
const THINKING_BLOCKS = new Set(["thinking", "redacted_thinking"]);
/** Why the model stopped, when its answer is complete. */
const FINISHED = new Set(["end_turn", "stop_sequence"]);
/** Control characters other than tabs and line breaks. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

export function aiUnavailable() {
  return new AppError(
    503,
    "ROUTE_ASSISTANT_UNAVAILABLE",
    "The Route Assistant isn't available right now. Your competition data is unchanged. Try again later.",
  );
}

function aiBusy(retryAfter) {
  const error = new AppError(
    503,
    "ROUTE_ASSISTANT_BUSY",
    "The Route Assistant is busy right now. Try again in a minute.",
  );
  if (Number.isInteger(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
  return error;
}

function badResponse() {
  return new AppError(
    502,
    "ROUTE_ASSISTANT_BAD_RESPONSE",
    "The Route Assistant's answer couldn't be used. Try asking again.",
  );
}

function declined() {
  return new AppError(
    422,
    "ROUTE_ASSISTANT_DECLINED",
    "The Route Assistant couldn't answer that question. Ask about how the competition's routes performed.",
  );
}

function retryAfterOf(response) {
  const value = Number.parseInt(response.headers?.get?.("retry-after") ?? "", 10);
  return Number.isInteger(value) ? value : undefined;
}

/**
 * Reads the answer out of a Messages API response, and refuses anything unexpected (US-023: handle
 * unexpected AI responses safely). Only text blocks become the answer; thinking blocks are skipped.
 * Any other block, such as a request to use a tool, is refused, since TopSend never offers the
 * model a tool. The text is plain: control characters are removed and the frontend shows it as
 * text, never as HTML.
 *
 * @param {unknown} body The parsed response.
 * @returns {{ text: string, truncated: boolean, stopReason: string, usage: { inputTokens: number | null, outputTokens: number | null } }}
 * @throws {AppError} 422 ROUTE_ASSISTANT_DECLINED when the model refused, or 502
 *   ROUTE_ASSISTANT_BAD_RESPONSE for any other answer that can't be used.
 */
export function readAnswer(body) {
  if (body?.type !== "message" || !Array.isArray(body.content)) {
    logger.error("Route Assistant answer had an unexpected shape");
    throw badResponse();
  }
  const stopReason = body.stop_reason;
  if (stopReason === "refusal") throw declined();
  if (!FINISHED.has(stopReason) && stopReason !== "max_tokens") {
    logger.error("Route Assistant answer stopped unexpectedly", { stopReason: String(stopReason) });
    throw badResponse();
  }

  const parts = [];
  for (const block of body.content) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
    else if (!THINKING_BLOCKS.has(block?.type)) {
      logger.error("Route Assistant answer had an unexpected block", { type: String(block?.type) });
      throw badResponse();
    }
  }

  let text = parts.join("\n\n").replace(CONTROL_CHARACTERS, "").trim();
  if (!text) throw badResponse();
  let truncated = stopReason === "max_tokens";
  if (text.length > ROUTE_ASSISTANT_ANSWER_MAX_LENGTH) {
    text = `${text.slice(0, ROUTE_ASSISTANT_ANSWER_MAX_LENGTH).trimEnd()}…`;
    truncated = true;
  }
  return {
    text,
    truncated,
    stopReason,
    usage: {
      inputTokens: Number.isInteger(body.usage?.input_tokens) ? body.usage.input_tokens : null,
      outputTokens: Number.isInteger(body.usage?.output_tokens) ? body.usage.output_tokens : null,
    },
  };
}
