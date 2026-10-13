import * as climberService from "../services/climberDetailsService.js";
import { assignDivision } from "../services/divisionService.js";

/** Returns a registered Climber's details within the Gym Admin's selected competition. */
export async function getClimber(req, res) {
  const { competitionId, climberId } = res.locals.params;
  res.json(await climberService.getClimber(res.locals.gyms, competitionId, climberId));
}

/** Updates the permitted event field using the existing atomic, competition-scoped assignment. */
export async function updateClimber(req, res) {
  const { competitionId, climberId } = res.locals.params;
  res.json(await assignDivision(
    res.locals.gyms, competitionId, climberId, req.body.divisionId, req.auth.userId,
  ));
}

/** Removes the selected event registration, returning 204 with no response body. */
export async function removeClimber(req, res) {
  const { competitionId, climberId } = res.locals.params;
  await climberService.removeClimber(res.locals.gyms, competitionId, climberId, req.auth.userId);
  res.status(204).end();
}
