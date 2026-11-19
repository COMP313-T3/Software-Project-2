import { GYM_REQUEST_TYPE } from "../constants/gymRequests.js";
import { ROLES } from "../constants/roles.js";
import { User } from "../models/User.js";
import { getSystemSettings } from "./systemSettingsService.js";

/**
 * Emails every active System Administrator about a new Gym Administrator access request, when an
 * Admin turned that on in System settings (US-010). Each Admin gets an email of their own, so no
 * address is shared. Nothing is sent without a mailer, where email isn't set up.
 *
 * @param {{ requestId: string, requestType: string, contact: { firstName: string, lastName: string }, gym: { name: string } }} request
 *   The submitted request, as the API answered it.
 * @param {{ mailer?: import("./mailService.js").Mailer | null, appUrl?: string }} options The mailer, and the
 *   address the client is at.
 * @returns {Promise<number>} How many Admins were emailed.
 */
export async function emailAdminsAboutRequest(request, { mailer, appUrl }) {
  if (!mailer || !appUrl) return 0;
  const settings = await getSystemSettings();
  if (!settings.accessRequestEmails) return 0;

  const admins = await User.find({ role: ROLES.ADMIN, isActive: true }, "email").lean();
  const name = `${request.contact.firstName} ${request.contact.lastName}`.trim();
  const asked =
    request.requestType === GYM_REQUEST_TYPE.NEW_GYM
      ? `to register a new gym, ${request.gym.name}`
      : `for Gym Administrator access to ${request.gym.name}`;
  const link = new URL(`${appUrl}/admin/gym-requests/${encodeURIComponent(request.requestId)}`);
  const message = {
    subject: "New Gym Administrator access request",
    text: `${name} asked ${asked} on TopSend.\n\nReview the request: ${link}\n`,
  };
  for (const admin of admins) await mailer.send({ to: admin.email, ...message });
  return admins.length;
}
