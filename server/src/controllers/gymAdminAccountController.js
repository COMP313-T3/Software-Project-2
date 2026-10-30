import * as accountService from "../services/gymAdminAccountService.js";

/**
 * GET /api/admin/gym-admins/:userId (US-007 criterion 1). Answers the Gym Administrator's account,
 * the gyms they manage, the approved gyms they could be given back, and their access.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getAccount(req, res) {
  res.json(await accountService.getGymAdminAccount(res.locals.params.userId));
}

/**
 * PATCH /api/admin/gym-admins/:userId (US-007 criterion 2). Saves the corrected name, email, or
 * phone and answers the account, shaped like GET.
 *
 * @param {import("express").Request} req Request whose body passed updateGymAdminAccountSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function updateAccount(req, res) {
  res.json(
    await accountService.updateGymAdminAccount(
      res.locals.params.userId,
      req.auth.userId,
      req.body,
    ),
  );
}

/**
 * PUT /api/admin/gym-admins/:userId/gyms/:gymId (US-007 criterion 3). Gives the account access to
 * a gym it was approved for. Answers { message, account }.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function addGymAccess(req, res) {
  const { userId, gymId } = res.locals.params;
  res.json(await accountService.addGymAccess(userId, gymId, req.auth.userId));
}

/**
 * DELETE /api/admin/gym-admins/:userId/gyms/:gymId (US-007 criterion 4). Removes the account from
 * one gym. Answers { message, account }.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function removeGymAccess(req, res) {
  const { userId, gymId } = res.locals.params;
  res.json(await accountService.removeGymAccess(userId, gymId, req.auth.userId));
}

/**
 * PATCH /api/admin/gym-admins/:userId/deactivate (US-007 criteria 5 and 6). Answers
 * { message, account, gymsWithoutActiveAdmin }.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function deactivate(req, res) {
  res.json(
    await accountService.deactivateGymAdmin(res.locals.params.userId, req.auth.userId),
  );
}

/**
 * PATCH /api/admin/gym-admins/:userId/activate. Answers { message, account }.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function activate(req, res) {
  res.json(
    await accountService.activateGymAdmin(res.locals.params.userId, req.auth.userId),
  );
}
