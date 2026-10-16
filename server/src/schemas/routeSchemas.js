import { z } from "zod";
import {
  ROUTE_GRADE_PATTERN,
  ROUTE_MAX_POINTS,
  ROUTE_NAME_MAX_LENGTH,
  ROUTE_NOTES_MAX_LENGTH,
  ROUTE_NUMBER_MAX_LENGTH,
} from "../constants/routes.js";
import { objectId, requiredText } from "./commonFields.js";
import { competitionIdParamsSchema } from "./gymAdminSchemas.js";

const GRADE_MESSAGE = "Enter a V-grade from V0 to V17, such as V4.";
const POINTS_MESSAGE = `Enter a whole number of points from 0 to ${new Intl.NumberFormat("en-CA").format(ROUTE_MAX_POINTS)}.`;

const routeNumber = requiredText("route number", ROUTE_NUMBER_MAX_LENGTH);

const routeName = z
  .string({ error: "Enter the route name." })
  .trim()
  .max(ROUTE_NAME_MAX_LENGTH, {
    error: `Use ${ROUTE_NAME_MAX_LENGTH} characters or fewer.`,
  });

const grade = z
  .string({ error: GRADE_MESSAGE })
  .trim()
  .regex(ROUTE_GRADE_PATTERN, { error: GRADE_MESSAGE });

const pointValue = z
  .number({ error: POINTS_MESSAGE })
  .int({ error: POINTS_MESSAGE })
  .min(0, { error: POINTS_MESSAGE })
  .max(ROUTE_MAX_POINTS, { error: POINTS_MESSAGE });

const notes = z
  .string({ error: "Enter route notes." })
  .trim()
  .max(ROUTE_NOTES_MAX_LENGTH, {
    error: `Use ${ROUTE_NOTES_MAX_LENGTH} characters or fewer.`,
  });

/**
 * Body of POST /api/gym-admin/competitions/:competitionId/routes (US-016). The route number
 * identifies the route, so its name is optional.
 */
export const createRouteSchema = z.object({
  routeNumber,
  name: routeName.optional().transform((value) => value || undefined),
  grade,
  pointValue: pointValue.optional(),
  notes: notes.optional().transform((value) => value || undefined),
  official: z.literal(true).optional().default(true),
});

/** Params for the routes of one competition: GET and POST /api/gym-admin/competitions/:competitionId/routes. */
export const routeCompetitionParamsSchema = competitionIdParamsSchema;

/** Params for GET and PATCH /api/gym-admin/competitions/:competitionId/routes/:routeId. */
export const routeParamsSchema = routeCompetitionParamsSchema.extend({
  routeId: objectId("route"),
});

/**
 * Editable route details for PATCH /api/gym-admin/competitions/:competitionId/routes/:routeId
 * (US-017). Route ownership and official status cannot be changed by the request. An empty name
 * or notes removes it.
 */
export const updateRouteSchema = z
  .object({
    routeNumber: routeNumber.optional(),
    name: routeName.optional(),
    grade: grade.optional(),
    pointValue: pointValue.optional(),
    notes: notes.optional(),
  })
  .refine((details) => Object.values(details).some((value) => value !== undefined), {
    error: "Change at least one route detail.",
  });
