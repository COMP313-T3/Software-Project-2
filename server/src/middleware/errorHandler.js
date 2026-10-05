import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

const BODY_PARSER_ERRORS = {
  "entity.parse.failed": {
    status: 400,
    code: "INVALID_JSON",
    message: "The request body is not valid JSON.",
  },
  "entity.too.large": {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "The request body is too large.",
  },
};

/**
 * Sends every error in the API's error shape from specs/contracts/interfaces.md:
 * { error, message }, plus fields for validation errors. An AppError with a retryAfter number of
 * seconds also gets a Retry-After header. Unexpected errors are
 * logged with the request ID and answered with a generic message and an errorId,
 * so stack traces and internal details never reach the client.
 *
 * @param {unknown} err Error raised by a route or middleware.
 * @param {import("express").Request} req Request that failed.
 * @param {import("express").Response} res Response to send.
 * @param {import("express").NextFunction} next Default handler, used when the response has already started.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    if (Number.isInteger(err.retryAfter)) {
      res.set("Retry-After", String(err.retryAfter));
    }
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    });
    return;
  }

  const bodyParserError = BODY_PARSER_ERRORS[err?.type];
  if (bodyParserError) {
    res
      .status(bodyParserError.status)
      .json({ error: bodyParserError.code, message: bodyParserError.message });
    return;
  }

  logger.error("Unhandled error", {
    requestId: req.id,
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.stack : String(err),
  });

  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    errorId: req.id,
  });
}
