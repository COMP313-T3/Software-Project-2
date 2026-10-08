import { Router } from "express";
import * as gymController from "../controllers/gymController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  createGymSchema,
  listGymsQuerySchema,
  updateGymSchema,
} from "../schemas/gymSchemas.js";
import { ROLES } from "../constants/roles.js";

/**
 * Routes under /api/gyms (US-004 and US-005). ADMIN only.
 *
 * @param {ReturnType<typeof import("../config/auth.js").createAuthContext>} auth The login setup.
 * @returns {import("express").Router} The router.
 */
export function createGymRoutes(auth) {
  const router = Router();

  router.use(requireAuth(auth), requireRole(ROLES.ADMIN));
  //router.use(requireAuth(auth), requireRole("ADMIN"));

  router.get("/", validateQuery(listGymsQuerySchema), gymController.listGyms);
  router.post("/", validateBody(createGymSchema), gymController.createGym);
  router.get("/:gymId", gymController.getGym);
  router.patch(
    "/:gymId",
    validateBody(updateGymSchema),
    gymController.updateGym,
  );
  router.patch("/:gymId/deactivate", gymController.deactivateGym);

  return router;
}