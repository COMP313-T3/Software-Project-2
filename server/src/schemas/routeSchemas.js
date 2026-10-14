import { z } from "zod";
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
