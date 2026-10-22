import {
  deleteGymRequest,
  getGymRequest,
  listGymRequests,
  renewSetupLink,
  reviewGymRequest,
} from "../services/gymRequestReviewService.js";
import { GYM_REQUEST_DECISION } from "../constants/gymRequests.js";
import { runInBackground } from "../utils/backgroundTasks.js";
import { logger } from "../utils/logger.js";

/**
 * Sends the applicant's email without making the Admin wait. Without a mailer, nothing is sent and
 * the answer says so, so the Admin knows to send a new setup link once email works. Both log lines
 * name the gym request, so a failed email can be matched to it.
 *
 * @returns {boolean} Whether the email was handed to the mailer.
 */
function sendEmail(mailer, email, req, gymRequestId) {
  const details = { requestId: req.id, gymRequestId: String(gymRequestId) };
  if (!mailer) {
    logger.warn("Gym request email not sent: email is off", details);
    return false;
  }
  runInBackground(() => mailer.send(email), "Gym request email failed", details);
  return true;
}

/**
 * Builds the System Administrator's gym request handlers (US-035).
 *
 * @param {{ mailer: import("../services/mailService.js").Mailer | null, appUrl: string }} options
 *   The mailer for the applicant's emails and the web app's address for setup links.
 * @returns {Record<"list" | "get" | "review" | "renewSetupLink" | "remove", import("express").RequestHandler>}
 */
export function createGymRequestReviewHandlers({ mailer, appUrl }) {
  return {
    /** GET /api/admin/gym-requests: { requests, total, page, limit }, PENDING by default. */
    async list(req, res) {
      res.json(await listGymRequests(res.locals.query));
    },

    /** GET /api/admin/gym-requests/:requestId: the request's contact and gym details. */
    async get(req, res) {
      res.json(await getGymRequest(res.locals.params.requestId));
    },

    /**
     * PATCH /api/admin/gym-requests/:requestId/review: approves or rejects a PENDING request.
     * Answers { message, request, emailSent }.
     */
    async review(req, res) {
      const { decision, reason } = req.body;
      const { request, email } = await reviewGymRequest({
        requestId: res.locals.params.requestId,
        adminId: req.auth.userId,
        decision,
        reason,
        appUrl,
      });
      const emailSent = sendEmail(mailer, email, req, request._id);

      let message;
      if (decision === GYM_REQUEST_DECISION.REJECT) {
        message = emailSent
          ? "Request rejected. We're emailing the applicant to let them know."
          : "Request rejected. Email is off, so the applicant wasn't told.";
      } else {
        message = emailSent
          ? "Request approved. We're emailing the applicant a link to set up their Gym Administrator account."
          : "Request approved, but email is off, so the setup link wasn't sent. Once email works, send a new setup link.";
      }
      res.json({ message, request, emailSent });
    },

    /**
     * POST /api/admin/gym-requests/:requestId/setup-link: emails a new account setup link to an
     * approved applicant who hasn't set up their account. Answers { message, request, emailSent }.
     */
    async renewSetupLink(req, res) {
      const { request, email } = await renewSetupLink({
        requestId: res.locals.params.requestId,
        appUrl,
      });
      const emailSent = sendEmail(mailer, email, req, request._id);
      res.json({
        message: emailSent
          ? "We're emailing the applicant a new setup link. Older links no longer work."
          : "A new setup link was made, but email is off, so it wasn't sent.",
        request,
        emailSent,
      });
    },

    /**
     * DELETE /api/admin/gym-requests/:requestId: deletes a rejected request, or a pending one
     * without contact details. Answers { message }.
     */
    async remove(req, res) {
      res.json(
        await deleteGymRequest({
          requestId: res.locals.params.requestId,
          adminId: req.auth.userId,
        }),
      );
    },
  };
}
