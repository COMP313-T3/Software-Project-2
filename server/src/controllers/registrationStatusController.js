import { getRegistrationStatus } from "../services/registrationStatusService.js";

/**
 * GET /api/competitions/:competitionId/registration (US-029). Answers the logged-in Climber's own
 * registration for the competition: { competition, registration, capacity }. The Climber is always
 * the one in the access token; no ID in the request can choose someone else.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getMyRegistration(req, res) {
  res.json(
    await getRegistrationStatus(req.auth.userId, res.locals.params.competitionId),
  );
}
