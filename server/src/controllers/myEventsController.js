import { getMyEvents } from "../services/myEventsService.js";

/**
 * GET /api/competitions/my-events (US-030). Answers only for the Climber in the access token.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listMyEvents(req, res) {
  res.json(await getMyEvents(req.auth.userId));
}
