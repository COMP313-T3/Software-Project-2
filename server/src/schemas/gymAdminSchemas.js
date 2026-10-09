import { z } from "zod";
import { COMPETITION_PERIOD, COMPETITION_PERIODS } from "../constants/competitions.js";
import { limit, objectId, page } from "./commonFields.js";

const PERIOD_MESSAGE = `Choose a period: ${COMPETITION_PERIODS.join(", ")}.`;

/**
 * Query for GET /api/gym-admin/competitions: which period to show, an optional gym (for a
 * Gym Admin assigned to more than one), and paging. Upcoming is the default.
 */
export const listManagedCompetitionsQuerySchema = z.object({
  period: z
    .enum(COMPETITION_PERIODS, { error: PERIOD_MESSAGE })
    .default(COMPETITION_PERIOD.UPCOMING),
  gymId: objectId("gym").optional(),
  page,
  limit,
});

/** Params for GET /api/gym-admin/competitions/:competitionId. */
export const competitionIdParamsSchema = z.object({
  competitionId: objectId("competition"),
});
