import { AppError } from "../utils/AppError.js";

/**
 * Turns zod's issues into the API's 400 VALIDATION_ERROR, with the first message for each field.
 *
 * @param {{ path: PropertyKey[], message: string }[]} issues Issues from a failed parse.
 * @returns {AppError} The error to throw.
 */
export function validationError(issues) {
  const fields = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field !== undefined) fields[field] ??= issue.message;
  }
  return new AppError(
    400,
    "VALIDATION_ERROR",
    "Check the fields and try again.",
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
