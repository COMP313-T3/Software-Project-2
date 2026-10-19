import { z } from "zod";
import { objectId } from "./commonFields.js";

/** The session is authoritative. A contract-compatible climberId, if supplied, must match it. */
export const createRegistrationSchema = z.object({
  divisionId: objectId("division"),
  climberId: objectId("climber").optional(),
});
