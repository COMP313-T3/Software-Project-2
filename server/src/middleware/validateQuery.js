import { validationError } from "./validateBody.js";

/**
 * Checks the query string against a zod schema. Express 5 doesn't let req.query be replaced, so
 * the parsed values go in res.locals.query. Fails with 400 VALIDATION_ERROR like validateBody.
 *
 * @param {import("zod").ZodType} schema Schema the query string must match.
 * @returns {import("express").RequestHandler} The middleware.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) throw validationError(result.error.issues);
    res.locals.query = result.data;
    next();
  };
}
