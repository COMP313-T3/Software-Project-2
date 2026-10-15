import { z } from "zod";
import { objectId } from "./commonFields.js";
import { competitionIdParamsSchema } from "./gymAdminSchemas.js";

const routeNumber = z
  .string({ error: "Enter the route number." })
  .trim()
  .min(1, { error: "Enter the route number." });

const routeName = z
  .string({ error: "Enter the route name." })
  .trim()
  .min(1, { error: "Enter the route name." });

const grade = z
  .string({ error: "Enter a V-grade, such as V4." })
  .trim()
  .regex(/^V(?:0|[1-9]\d*)$/, { error: "Enter a V-grade, such as V4." });

/** Body of POST /api/gym-admin/competitions/:competitionId/routes (US-016). */
export const createRouteSchema = z.object({
  routeNumber,
  name: routeName,
  grade,
  pointValue: z.number().finite().optional(),
  notes: z
    .string({ error: "Enter route notes." })
    .trim()
    .optional()
    .transform((value) => value || undefined),
  official: z.literal(true).optional().default(true),
});

/** Params for POST /api/gym-admin/competitions/:competitionId/routes. */
export const routeCompetitionParamsSchema = competitionIdParamsSchema;

/** Params for GET and PATCH /api/gym-admin/competitions/:competitionId/routes/:routeId. */
export const routeParamsSchema = routeCompetitionParamsSchema.extend({
  routeId: objectId("route"),
});

/**
 * Editable route details for PATCH /api/gym-admin/competitions/:competitionId/routes/:routeId
 * (US-017). Route ownership and official status cannot be changed by the request.
 */
export const updateRouteSchema = z
  .object({
    routeNumber: routeNumber.optional(),
    name: routeName.optional(),
    grade: grade.optional(),
    pointValue: z.number().finite().optional(),
    notes: z.string({ error: "Enter route notes." }).trim().optional(),
  })
  .refine((details) => Object.values(details).some((value) => value !== undefined), {
    error: "Change at least one route detail.",
  });
