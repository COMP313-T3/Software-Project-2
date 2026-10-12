import { z } from "zod";
import { DIVISION_NAME_MAX_LENGTH } from "../constants/divisions.js";
import { objectId, requiredText } from "./commonFields.js";
import { competitionIdParamsSchema } from "./gymAdminSchemas.js";

/** Body of POST /api/gym-admin/competitions/:competitionId/divisions (US-014). */
export const createDivisionSchema = z.object({
  name: requiredText("division name", DIVISION_NAME_MAX_LENGTH),
});

/**
 * Query for GET /api/gym-admin/competitions/:competitionId/climbers: optionally only the
 * Climbers in one division.
 */
export const listClimbersQuerySchema = z.object({
  divisionId: objectId("division").optional(),
});

/** Params for PUT /api/gym-admin/competitions/:competitionId/climbers/:climberId/division. */
export const climberParamsSchema = competitionIdParamsSchema.extend({
  climberId: objectId("climber"),
});

/**
 * Body of PUT /api/gym-admin/competitions/:competitionId/climbers/:climberId/division: the
 * division to place the Climber in. The service checks it belongs to the same competition.
 */
export const divisionAssignmentSchema = z.object({
  divisionId: objectId("division"),
});
