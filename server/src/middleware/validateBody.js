import { AppError } from "../utils/AppError.js";

const CHECK_THE_FIELDS = "Check the fields and try again.";

/**
 * Turns zod's issues into the API's 400 VALIDATION_ERROR, with the first message for each field.
 * A rule about the request as a whole, such as "Change at least one competition detail.", has no
 * field, so its message becomes the error's message instead. Only the schemas' own rules (code
 * "custom") are shown that way, never zod's built-in wording.
 *
 * @param {{ path: PropertyKey[], message: string, code?: string }[]} issues Issues from a failed
 *   parse.
 * @returns {AppError} The error to throw.
 */
export function validationError(issues) {
  const fields = {};
  let wholeRequest;
  for (const issue of issues) {
    const field = issue.path[0];
    if (field !== undefined) fields[field] ??= issue.message;
    else if (issue.code === "custom") wholeRequest ??= issue.message;
  }
  return new AppError(
    400,
    "VALIDATION_ERROR",
    wholeRequest ?? CHECK_THE_FIELDS,
    Object.keys(fields).length > 0 ? fields : undefined,
  );
}

/**
 * Checks req.body against a zod schema and replaces it with the parsed result, so later
 * handlers only see cleaned, known fields. Fails with 400 VALIDATION_ERROR and the first
 * message for each field.
 *
 * @param {import("zod").ZodType} schema Schema the body must match.
 * @returns {import("express").RequestHandler} The middleware.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) throw validationError(result.error.issues);
    req.body = result.data;
    next();
  };
}
