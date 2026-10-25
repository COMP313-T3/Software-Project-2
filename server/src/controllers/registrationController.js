import { registerClimber } from "../services/registrationService.js";
import { AppError } from "../utils/AppError.js";

/** POST /api/competitions/:competitionId/registrations. Never trust a body-supplied identity. */
export async function createRegistration(req, res) {
  const { divisionId, climberId } = req.body;
  if (climberId && climberId.toLowerCase() !== String(req.auth.userId).toLowerCase()) {
    throw new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", { climberId: "You can only register your own Climber account." });
  }
  res.status(201).json(await registerClimber(res.locals.params.competitionId, req.auth.userId, divisionId));
}
