import { validationError } from "./validateBody.js";

/**
 * Checks the route params, such as an :id, against a zod schema. Like validateQuery, the parsed
 * values go in res.locals.params rather than replacing req.params. Fails with 400
 * VALIDATION_ERROR like validateBody.
 *
 * @param {import("zod").ZodType} schema Schema the params must match.
 * @returns {import("express").RequestHandler} The middleware.
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) throw validationError(result.error.issues);
    res.locals.params = result.data;
    next();
  };
}
