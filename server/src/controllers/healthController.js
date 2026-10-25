import { isDatabaseConnected } from "../config/database.js";

/**
 * Reports that the API is running and whether it is connected to the database.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Responds with { status, database }.
 */
export function getHealth(req, res) {
  res.json({
    status: "ok",
    database: isDatabaseConnected() ? "connected" : "disconnected",
  });
}
