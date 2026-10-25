import { Router } from "express";
import { getDashboardSummary } from "../controllers/adminController.js";
import { createGymRequestReviewHandlers } from "../controllers/gymRequestReviewController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  gymRequestParamsSchema,
  listGymRequestsQuerySchema,
  reviewGymRequestSchema,
} from "../schemas/gymRequestReviewSchemas.js";
import { ROLES } from "../constants/roles.js";

/**
 * Routes under /api/admin, for the System Administrator. Every route needs the access token and
 * the ADMIN role: no token answers 401, and any other role answers 403 ROLE_FORBIDDEN.
 *
 * GET /dashboard: the platform's gym, user, and pending request counts (US-003).
 *
 * Gym registration and Gym Administrator access requests (US-035):
 * GET /gym-requests: the review list, PENDING by default.
 * GET /gym-requests/:requestId: one request's contact and gym details.
 * PATCH /gym-requests/:requestId/review: approves or rejects a PENDING request.
 * POST /gym-requests/:requestId/setup-link: emails an approved applicant a new setup link.
 * DELETE /gym-requests/:requestId: deletes a rejected request, or a pending one without contact
 *   details.
 *
 * @param {{ auth: ReturnType<typeof import("../config/auth.js").createAuthContext>, mailer?: import("../services/mailService.js").Mailer | null, appUrl: string }} options
 *   The login setup, the mailer for applicants' emails, and the web app's address for links.
 * @returns {import("express").Router} The router.
 */
export function createAdminRoutes({ auth, mailer = null, appUrl }) {
  const router = Router();
  const gymRequests = createGymRequestReviewHandlers({ mailer, appUrl });
  const requestIdParams = validateParams(gymRequestParamsSchema);

  router.use(requireAuth(auth), requireRole(ROLES.ADMIN));

  router.get("/dashboard", getDashboardSummary);

  router.get("/gym-requests", validateQuery(listGymRequestsQuerySchema), gymRequests.list);
  router.get("/gym-requests/:requestId", requestIdParams, gymRequests.get);
  router.patch(
    "/gym-requests/:requestId/review",
    requestIdParams,
    validateBody(reviewGymRequestSchema),
    gymRequests.review,
  );
  router.post(
    "/gym-requests/:requestId/setup-link",
    requestIdParams,
    gymRequests.renewSetupLink,
  );
  router.delete("/gym-requests/:requestId", requestIdParams, gymRequests.remove);

  return router;
}
