import { z } from "zod";
import { objectId } from "./commonFields.js";

/**
 * Query for every leaderboard route (US-020, US-032): optionally only one division's standings.
 * Left empty, such as ?divisionId= from a cleared dropdown, it means every division.
 */
export const leaderboardQuerySchema = z.object({
  divisionId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    objectId("division").optional(),
  ),
});
