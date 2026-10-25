import { Router } from "express";
import { createSessionHandlers } from "../controllers/sessionController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validateBody.js";
import { pingSchema } from "../schemas/loginSchemas.js";

/**
 * Routes under /api/session. POST /ping is the keep-alive the client sends while the user is
 * active, at most every 5 minutes, and when a tab comes back into view. It needs the access token,
 * and reports the user's own idle time instead of counting as activity itself.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext> }} options The login setup.
 * @returns {import("express").Router} The router.
 */
export function createSessionRoutes({ auth }) {
  const router = Router();
  const { ping } = createSessionHandlers(auth);

  router.post(
    "/ping",
    requireAuth(auth, { countsAsActivity: false }),
    validateBody(pingSchema),
    ping,
  );

  return router;
}
