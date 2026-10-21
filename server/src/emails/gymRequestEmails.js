/**
 * Emails sent to a gym request's applicant once a System Administrator reviews it (US-035).
 * Each returns the subject and both bodies, ready for mailer.send({ to, ...email }).
 */

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text from the request, such as names, before it goes into HTML. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

/**
 * The approval email, with the one-time link to set up the Gym Administrator account
 * (US-034 criterion 7, US-035 criterion 6).
 *
 * @param {{ firstName: string, gymName: string, link: string, expiresAt: Date }} details
 *   The applicant's first name, the gym, the setup link, and when the link stops working.
 * @returns {{ subject: string, text: string, html: string }} The email.
 */
export function gymAdminApprovedEmail({ firstName, gymName, link, expiresAt }) {
  const expires = formatDate(expiresAt);
  return {
    subject: "Your TopSend Gym Administrator request was approved",
    text:
      `Hi ${firstName},\n\n` +
      `Your request to manage ${gymName} on TopSend was approved.\n\n` +
      `Set up your Gym Administrator account by choosing a password here:\n${link}\n\n` +
      `This link works once and expires on ${expires} (Toronto time). If it runs out, contact ` +
      `TopSend and we'll send you a new one.\n\n— The TopSend team`,
    html:
      `<p>Hi ${escapeHtml(firstName)},</p>` +
      `<p>Your request to manage <strong>${escapeHtml(gymName)}</strong> on TopSend was approved.</p>` +
      `<p><a href="${escapeHtml(link)}">Set up your Gym Administrator account</a></p>` +
      `<p>This link works once and expires on ${escapeHtml(expires)} (Toronto time). If it runs ` +
      `out, contact TopSend and we'll send you a new one.</p><p>— The TopSend team</p>`,
  };
}

/**
 * The rejection email (US-035 criterion 7). It includes the Admin's reason when one was given.
 *
 * @param {{ firstName: string, gymName: string, reason?: string }} details The applicant's first
 *   name, the gym, and the optional reason.
 * @returns {{ subject: string, text: string, html: string }} The email.
 */
export function gymRequestRejectedEmail({ firstName, gymName, reason }) {
  const reasonText = reason ? `Reason: ${reason}\n\n` : "";
  const reasonHtml = reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : "";
  return {
    subject: "Your TopSend Gym Administrator request",
    text:
      `Hi ${firstName},\n\n` +
      `Your request to manage ${gymName} on TopSend wasn't approved, so no Gym Administrator ` +
      `access was given.\n\n${reasonText}` +
      `You can send a new request from the TopSend website at any time.\n\n— The TopSend team`,
    html:
      `<p>Hi ${escapeHtml(firstName)},</p>` +
      `<p>Your request to manage <strong>${escapeHtml(gymName)}</strong> on TopSend wasn't ` +
      `approved, so no Gym Administrator access was given.</p>${reasonHtml}` +
      `<p>You can send a new request from the TopSend website at any time.</p>` +
      `<p>— The TopSend team</p>`,
  };
}
