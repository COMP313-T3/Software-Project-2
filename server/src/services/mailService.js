import { createTransport } from "nodemailer";

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

/**
 * @typedef {object} EmailMessage
 * @property {string} to Recipient address.
 * @property {string} subject Subject line.
 * @property {string} text Plain text body.
 * @property {string} [html] HTML body, shown by email apps that support it.
 */

/**
 * @typedef {object} Mailer
 * @property {(message: EmailMessage) => Promise<void>} send Sends one email.
 * @property {() => Promise<unknown>} [verify] Signs in to the SMTP server without sending anything.
 */

/**
 * Stands in for an inbox during development while SMTP isn't set up: each email is printed in
 * the server's terminal instead of being sent, so its links can be opened from there.
 *
 * @type {Mailer}
 */
export const terminalMailer = {
  async send({ to, subject, text }) {
    console.log(
      `Email to ${to}, printed here because SMTP isn't set up:\nSubject: ${subject}\n\n${text}\n`,
    );
  },
};

/**
 * Builds the mailer for account emails, such as password reset links.
 *
 * @param {{ smtp: { host: string, port: number, user: string, pass: string } | null, mailFrom: string, nodeEnv: string }} config
 *   The SMTP settings (null when they're empty), the From address, and the environment.
 * @returns {Mailer | null} A mailer that sends through SMTP; the terminal mailer in development
 *   while SMTP isn't set up; or null anywhere else without SMTP, where email is off, so links
 *   never end up in a hosted server's logs.
 */
export function createMailer({ smtp, mailFrom, nodeEnv }) {
  if (!smtp) return nodeEnv === "development" ? terminalMailer : null;

  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port !== 465,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  return {
    async send(message) {
      await transport.sendMail({ from: mailFrom, ...message });
    },
    verify: () => transport.verify(),
  };
}
