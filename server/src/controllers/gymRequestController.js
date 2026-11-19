import { emailAdminsAboutRequest } from "../services/accessRequestEmails.js";
import * as gymRequestService from "../services/gymRequestService.js";
import { logger } from "../utils/logger.js";

/**
 * Builds POST /api/gym-requests (US-034). It saves the Visitor's request as PENDING and answers 201
 * with a confirmation: { requestId, requestType, status, submittedAt, contact, gym, message,
 * nextSteps }. It grants no access: the applicant stays a Visitor until a System Administrator
 * approves it. The Admins' emails about it go out after the answer, so a slow or failed email never
 * holds the applicant up.
 *
 * @param {{ mailer?: import("../services/mailService.js").Mailer | null, appUrl?: string }} [options]
 *   The mailer, and the address the client is at.
 * @returns {import("express").RequestHandler} The handler.
 */
export function createSubmitGymRequest({ mailer, appUrl } = {}) {
  return async function submitGymRequest(req, res) {
    const request = await gymRequestService.submitGymRequest(req.body);
    res.status(201).json(request);
    emailAdminsAboutRequest(request, { mailer, appUrl }).catch((error) => {
      logger.error("Couldn't email the System Administrators about a new access request", {
        requestId: request.requestId,
        error: error.message,
      });
    });
  };
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
