import * as gymRequestService from "../services/gymRequestService.js";

/**
 * POST /api/gym-requests (US-034). Saves the Visitor's request as PENDING and answers 201 with a
 * confirmation: { requestId, requestType, status, submittedAt, contact, gym, message, nextSteps }.
 * It grants no access: the applicant stays a Visitor until a System Administrator approves it.
 *
 * @param {import("express").Request} req Request whose body passed gymRequestSchema.
 * @param {import("express").Response} res Outgoing response.
 */
export async function submitGymRequest(req, res) {
  res.status(201).json(await gymRequestService.submitGymRequest(req.body));
}

/**
 * GET /api/gym-requests/gyms (US-034 criterion 2). Answers { gyms }: the registered gyms a Visitor
 * can ask to administer, by name, matching the optional search text in res.locals.query.
 *
 * @param {import("express").Request} req Incoming request.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listRegisteredGyms(req, res) {
  res.json(await gymRequestService.listRegisteredGyms(res.locals.query));
}
