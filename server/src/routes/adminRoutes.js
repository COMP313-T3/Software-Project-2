import { Router } from "express";
import {
  deactivateUser,
  getDashboardSummary,
  updateUser,
} from "../controllers/adminController.js";
import * as gymAdminAccountController from "../controllers/gymAdminAccountController.js";
import { createGymRequestReviewHandlers } from "../controllers/gymRequestReviewController.js";
import * as userAdminController from "../controllers/userAdminController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateBody } from "../middleware/validateBody.js";
import { validateParams } from "../middleware/validateParams.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  gymAccessParamsSchema,
  gymAdminParamsSchema,
  updateGymAdminAccountSchema,
} from "../schemas/gymAdminAccountSchemas.js";
import {
  gymRequestParamsSchema,
  listGymRequestsQuerySchema,
  reviewGymRequestSchema,
} from "../schemas/gymRequestReviewSchemas.js";
import { listUsersQuerySchema, userIdParamsSchema } from "../schemas/userAdminSchemas.js";
import {
  updateUserSchema,
} from "../schemas/adminUserSchemas.js";
import { ROLES } from "../constants/roles.js";

/**
 * Routes under /api/admin, for the System Administrator. Every route needs the access token and
 * the ADMIN role: no token answers 401, and any other role answers 403 ROLE_FORBIDDEN.
 *
 * GET /dashboard: the platform's gym, user, and pending request counts (US-003).
 *
 * Registered accounts, for the Manage Users page (US-008):
 * GET /users: the accounts that match the search and filters, by page.
 * GET /users/filters: the choices for the filters and order.
 * GET /users/:userId: one account's details.
 * /users/filters comes before /users/:userId, so "filters" is never read as an ID.
 *
 * Gym registration and Gym Administrator access requests (US-035):
 * GET /gym-requests: the review list, PENDING by default.
 * GET /gym-requests/:requestId: one request's contact and gym details.
 * PATCH /gym-requests/:requestId/review: approves or rejects a PENDING request.
 * POST /gym-requests/:requestId/setup-link: emails an approved applicant a new setup link.
 * DELETE /gym-requests/:requestId: deletes a rejected request, or a pending one without contact
 *   details.
 *
 * Gym Administrator accounts, for the Administrator Details page (US-007):
 * GET /gym-admins/:userId: the account, its gyms, and its access.
 * PATCH /gym-admins/:userId: corrects its name, email, or phone.
 * PUT /gym-admins/:userId/gyms/:gymId: gives it access to a gym it was approved for.
 * DELETE /gym-admins/:userId/gyms/:gymId: removes it from a gym.
 * PATCH /gym-admins/:userId/deactivate: turns the account off and logs it out everywhere.
 * PATCH /gym-admins/:userId/activate: turns it back on.
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

  router.get("/users", validateQuery(listUsersQuerySchema), userAdminController.listUsers);
  router.get("/users/filters", userAdminController.getFilterOptions);
  router.get(
    "/users/:userId",
    validateParams(userIdParamsSchema),
    userAdminController.getUser,
  );

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

  const gymAdminParams = validateParams(gymAdminParamsSchema);
  const gymAccessParams = validateParams(gymAccessParamsSchema);
  router.get("/gym-admins/:userId", gymAdminParams, gymAdminAccountController.getAccount);
  router.patch(
    "/gym-admins/:userId",
    gymAdminParams,
    validateBody(updateGymAdminAccountSchema),
    gymAdminAccountController.updateAccount,
  );
  router.put(
    "/gym-admins/:userId/gyms/:gymId",
    gymAccessParams,
    gymAdminAccountController.addGymAccess,
  );
  router.delete(
    "/gym-admins/:userId/gyms/:gymId",
    gymAccessParams,
    gymAdminAccountController.removeGymAccess,
  );
  router.patch(
    "/gym-admins/:userId/deactivate",
    gymAdminParams,
    gymAdminAccountController.deactivate,
  );
  router.patch(
    "/gym-admins/:userId/activate",
    gymAdminParams,
    gymAdminAccountController.activate,
  );
  router.patch(
    "/users/:userId/deactivate",
    requireAuth(auth),
    requireRole(ROLES.ADMIN),
    validateParams(userIdParamsSchema),
    deactivateUser,
  );
  router.patch(
    "/users/:userId",
    requireAuth(auth),
    requireRole(ROLES.ADMIN),
    validateParams(userIdParamsSchema),
    validateBody(updateUserSchema),
    updateUser,
  );

  return router;
}
