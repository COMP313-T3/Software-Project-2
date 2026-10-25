import { checkSetupLink, completeGymAdminSetup } from "../services/gymAdminSetupService.js";

/**
 * POST /api/gym-requests/setup/check (US-035 criterion 6). Answers whose account the setup link
 * sets up: { firstName, lastName, email, gym }.
 *
 * @param {import("express").Request} req Request whose body passed gymAdminSetupLinkSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function checkLink(req, res) {
  res.json(await checkSetupLink(req.body.token));
}

/**
 * POST /api/gym-requests/setup (US-035 criterion 6). Creates the approved applicant's GYM_ADMIN
 * account, assigns it to the gym, and answers 201 with the account and gym.
 *
 * @param {import("express").Request} req Request whose body passed gymAdminSetupSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function completeSetup(req, res) {
  res.status(201).json(await completeGymAdminSetup(req.body.token, req.body.password));
}
