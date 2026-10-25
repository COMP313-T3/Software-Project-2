import { AppError } from "../utils/AppError.js";

/**
 * Turns any request that no route handled into a JSON 404.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Passes the 404 to the error handler.
 */
export function notFound(req, res, next) {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found."));
}
