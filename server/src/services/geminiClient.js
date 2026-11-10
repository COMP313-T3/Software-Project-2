import {
  GEMINI_API_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_THINKING_LEVELS,
  GEMINI_TIMEOUT_MS,
  ROUTE_ASSISTANT_ANSWER_MAX_LENGTH,
} from "../constants/routeAssistant.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/** Why Gemini stopped, when its answer is complete. */
const FINISHED = new Set(["STOP"]);
/** Why Gemini stopped when it wouldn't answer, such as a safety block. */
const DECLINED = new Set(["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);
/**
 * Parts that would carry something other than text, such as a function call or code to run. TopSend
 * never offers Gemini a tool, so any of these means the answer can't be used.
 */
const ACTION_PARTS = [
  "functionCall",
  "functionResponse",
  "executableCode",
  "codeExecutionResult",
  "toolCall",
  "toolResponse",
  "inlineData",
  "fileData",
];
/** A model name as it goes in the URL: letters, digits, dots, dashes and underscores. */
const MODEL_NAME = /^[\w.-]+$/;
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
    "The Route Assistant couldn't answer that question. Ask about this competition's routes, results or standings.",
  );
}

/**
 * How long Gemini asks to wait, in whole seconds: from a Retry-After header, or from the RetryInfo
 * detail of its error ({ "@type": "...RetryInfo", retryDelay: "30s" }).
 */
function retryAfterOf(response, detail) {
  const header = Number.parseInt(response.headers?.get?.("retry-after") ?? "", 10);
  if (Number.isInteger(header)) return header;
  const info = Array.isArray(detail?.error?.details)
    ? detail.error.details.find((item) => typeof item?.retryDelay === "string")
    : null;
  const seconds = Number.parseFloat(info?.retryDelay ?? "");
  return Number.isFinite(seconds) ? Math.ceil(seconds) : undefined;
}

/**
 * Reads the answer out of a generateContent response, and refuses anything unexpected (US-023:
 * handle unexpected AI responses safely). Only the first candidate's text parts become the answer;
 * thought parts are skipped. A part carrying anything else, such as a function call, is refused,
 * since TopSend never offers Gemini a tool. The text is plain: control characters are removed and
 * the frontend shows it as text, never as HTML.
 *
 * @param {unknown} body The parsed response.
 * @returns {{ text: string, truncated: boolean, stopReason: string, usage: { inputTokens: number | null, outputTokens: number | null } }}
 * @throws {AppError} 422 ROUTE_ASSISTANT_DECLINED when Gemini blocked the question or its answer,
 *   or 502 ROUTE_ASSISTANT_BAD_RESPONSE for any other answer that can't be used.
 */
export function readAnswer(body) {
  if (!body || typeof body !== "object") {
    logger.error("Route Assistant answer had an unexpected shape");
    throw badResponse();
  }
  // The question itself was blocked, so there's no candidate.
  if (body.promptFeedback?.blockReason) {
    logger.warn("Route Assistant question was blocked", { blockReason: String(body.promptFeedback.blockReason) });
    throw declined();
  }
  const candidate = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
  if (!candidate) {
    logger.error("Route Assistant answer had no candidate");
    throw badResponse();
  }

  const stopReason = candidate.finishReason ?? "STOP";
  if (DECLINED.has(stopReason)) {
    logger.warn("Route Assistant answer was blocked", { finishReason: stopReason });
    throw declined();
  }
  if (!FINISHED.has(stopReason) && stopReason !== "MAX_TOKENS") {
    logger.error("Route Assistant answer stopped unexpectedly", { finishReason: String(stopReason) });
    throw badResponse();
  }

  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  const texts = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") throw badResponse();
    if (part.thought === true) continue;
    const action = ACTION_PARTS.find((key) => key in part);
    if (action) {
      logger.error("Route Assistant answer had an unexpected part", { part: action });
      throw badResponse();
    }
    if (typeof part.text === "string") texts.push(part.text);
    // Anything else, such as a part holding only a thought signature, carries no answer.
  }

  let text = texts.join("").replace(CONTROL_CHARACTERS, "").trim();
  if (!text) throw badResponse();
  let truncated = stopReason === "MAX_TOKENS";
  if (text.length > ROUTE_ASSISTANT_ANSWER_MAX_LENGTH) {
    text = `${text.slice(0, ROUTE_ASSISTANT_ANSWER_MAX_LENGTH).trimEnd()}…`;
    truncated = true;
  }

  const usage = body.usageMetadata ?? {};
  const whole = (value) => (Number.isInteger(value) ? value : null);
  const answerTokens = whole(usage.candidatesTokenCount);
  const thinkingTokens = whole(usage.thoughtsTokenCount);
  return {
    text,
    truncated,
    stopReason,
    usage: {
      inputTokens: whole(usage.promptTokenCount),
      // Thinking is billed as output, so it's counted with the answer.
      outputTokens: answerTokens === null && thinkingTokens === null ? null : (answerTokens ?? 0) + (thinkingTokens ?? 0),
    },
  };
}

/**
 * Turns the assistant's request ({ system, messages }) into a generateContent body. Only these
 * fields are ever sent: there are no tools, so Gemini has no way to act on anything, and no
 * temperature, which current Gemini models ignore or refuse.
 */
function toGeminiRequest({ system, messages }, { maxOutputTokens, thinkingLevel }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      maxOutputTokens,
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
    },
  };
}

/**
 * Builds the client for the Google Gemini API (generateContent), called only from the server, so
 * the API key never reaches a browser. The key goes in the x-goog-api-key header, never in the
 * URL, so it can't end up in a log of addresses.
 *
 * The client can only ask for text. It never sends tools, so Gemini has no way to act on anything:
 * whatever it writes is returned as an explanation, and nothing it writes is run or saved (US-023
 * criterion 6, section 11 of the spec).
 *
 * @param {{ apiKey?: string, model?: string, thinkingLevel?: string, fetchImpl?: typeof fetch, timeoutMs?: number, maxOutputTokens?: number }} [options]
 *   The API key (an empty one turns the assistant off), the model, the thinking level (empty
 *   leaves the model's default), and, for tests, the fetch function, the time limit, and the token
 *   limit.
 * @returns {{ enabled: boolean, model: string, createMessage: (request: { system: string, messages: { role: "user" | "assistant", content: string }[] }) => Promise<ReturnType<typeof readAnswer>> }}
 */
export function createGeminiClient({
  apiKey = "",
  model = GEMINI_DEFAULT_MODEL,
  thinkingLevel = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = GEMINI_TIMEOUT_MS,
  maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS,
} = {}) {
  const modelName = model || GEMINI_DEFAULT_MODEL;
  const level = String(thinkingLevel ?? "").trim().toLowerCase();
  const settingsOk = MODEL_NAME.test(modelName) && (!level || GEMINI_THINKING_LEVELS.includes(level));
  if (!settingsOk) {
    logger.error("GEMINI_MODEL or GEMINI_THINKING_LEVEL isn't valid, so the Route Assistant is off", {
      model: modelName,
      thinkingLevel: level,
    });
  }
  const enabled = typeof apiKey === "string" && apiKey.trim() !== "" && settingsOk;
  const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(modelName)}:generateContent`;

  async function createMessage(request) {
    if (!enabled) throw aiUnavailable();

    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey.trim(),
        },
        body: JSON.stringify(toGeminiRequest(request, { maxOutputTokens, thinkingLevel: level })),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      logger.error("Couldn't reach the Route Assistant AI", {
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
      throw aiUnavailable();
    }

    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      // The status name (such as RESOURCE_EXHAUSTED) helps find the cause. The message can repeat
      // the request, so it isn't logged.
      logger.error("The Route Assistant AI answered with an error", {
        status: response.status,
        type: typeof detail?.error?.status === "string" ? detail.error.status : null,
      });
      // 429: over the quota or rate limit. 503: the model is overloaded right now.
      if (response.status === 429 || response.status === 503) {
        throw aiBusy(retryAfterOf(response, detail));
      }
      throw aiUnavailable();
    }

    let body;
    try {
      body = await response.json();
    } catch {
      logger.error("The Route Assistant AI answer wasn't JSON");
      throw badResponse();
    }
    return readAnswer(body);
  }

  return { enabled, model: modelName, createMessage };
}
