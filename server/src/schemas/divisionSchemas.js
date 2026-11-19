import { z } from "zod";
import { DIVISION_NAMES, divisionNameOf } from "../constants/divisions.js";
import { objectId } from "./commonFields.js";
import { competitionIdParamsSchema } from "./gymAdminSchemas.js";

const NAME_MESSAGE = "Choose Open, Beginner, Youth, or Advanced.";

/**
 * Body of POST /api/gym-admin/competitions/:competitionId/divisions (US-014): one of
 * DIVISION_NAMES, saved as that list spells it.
 */
export const createDivisionSchema = z.object({
  name: z.preprocess(divisionNameOf, z.enum(DIVISION_NAMES, { error: NAME_MESSAGE })),
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
