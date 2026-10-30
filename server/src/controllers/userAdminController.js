import * as userAdminService from "../services/userAdminService.js";

/**
 * GET /api/admin/users (US-008 criteria 1 to 3). Answers { users, total, page, limit }: the
 * accounts that match the validated search and filters in res.locals.query.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listUsers(req, res) {
  res.json(await userAdminService.listUsers(res.locals.query));
}

/**
 * GET /api/admin/users/filters (US-008 criterion 3). Answers { roles, statuses, sorts, gyms }: the
 * choices for the Manage Users page's filters and order.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getFilterOptions(req, res) {
  res.json(await userAdminService.userFilterOptions());
}

/**
 * GET /api/admin/users/:userId (US-008 criteria 4 and 5). Answers one account's details, or 404
 * USER_NOT_FOUND.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getUser(req, res) {
  res.json(await userAdminService.getUserDetails(res.locals.params.userId));
}