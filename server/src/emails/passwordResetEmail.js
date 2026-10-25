const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * The email with a password reset link.
 *
 * @param {{ firstName: string, link: string }} details The account holder's first name and the
 *   reset link.
 * @returns {{ subject: string, text: string, html: string }} The subject and the plain text and
 *   HTML bodies.
 */
export function passwordResetEmail({ firstName, link }) {
  const name = escapeHtml(firstName);
  const href = escapeHtml(link);

  const text = [
    `Hi ${firstName},`,
    "",
    "We got a request to reset the password for your TopSend account. Open this link to choose a new password. It works once, within 1 hour.",
    "",
    link,
    "",
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
    "",
    "TopSend",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background:#f4efe8;color:#17120b;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:28px 24px;border-radius:12px;background:#ffffff;">
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">We got a request to reset the password for your TopSend account. Choose a new password with the button below. The link works once, within 1 hour.</p>
      <p style="margin:0 0 24px;"><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#fdc914;color:#17120b;font-size:15px;font-weight:bold;text-decoration:none;">Choose a new password</a></p>
      <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#5f5347;">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:#17120b;">${href}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#5f5347;">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
    </div>
  </body>
</html>
`;

  return { subject: "Reset your TopSend password", text, html };
}
