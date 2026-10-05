import { createHash, randomBytes } from "node:crypto";
import { passwordResetEmail } from "../emails/passwordResetEmail.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { clearLoginFailures } from "./loginService.js";
import { hashPassword } from "./passwordService.js";
import { endAllSessions } from "./sessionService.js";

/** How long a reset link works after it's sent. */
export const RESET_LINK_LIFETIME_MS = 60 * 60 * 1000;

const TOKEN_BYTES = 32;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function linkInvalid() {
  return new AppError(
    400,
    "RESET_LINK_INVALID",
    "This reset link has expired or was already used. Ask for a new one.",
  );
}

async function findUsableLink(token) {
  const link = await PasswordResetToken.findOne({
    tokenHash: hashToken(token),
  });
  return link && link.expiresAt > new Date() ? link : null;
}

/**
 * Emails a password reset link to the account with this email, if there is an active one.
 * When there isn't, nothing happens, and the caller answers the same way either way, so the
 * request never reveals whether an email has an account.
 *
 * @param {{ email: string, mailer: import("./mailService.js").Mailer, appUrl: string }} request
 *   The email (lowercased), the mailer, and the web app's address for the link.
 * @returns {Promise<void>}
 */
export async function sendPasswordResetLink({ email, mailer, appUrl }) {
  const user = await User.findOne({ email, isActive: true }, "firstName email");
  if (!user) return;

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await PasswordResetToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_LINK_LIFETIME_MS),
  });

  const link = new URL(`${appUrl}/reset-password`);
  link.searchParams.set("token", token);
  await mailer.send({
    to: user.email,
    ...passwordResetEmail({ firstName: user.firstName, link: link.href }),
  });
  logger.info("Password reset link sent", { userId: user.id });
}

/**
 * Checks that a reset link still works, before the new password is typed.
 *
 * @param {string} token The token from the link.
 * @returns {Promise<{ email: string }>} The email of the account the link resets.
 * @throws {AppError} 400 RESET_LINK_INVALID when the link is unknown, expired, or used.
 */
export async function checkResetLink(token) {
  const link = await findUsableLink(token);
  const user =
    link && (await User.findOne({ _id: link.user, isActive: true }, "email"));
  if (!user) throw linkInvalid();
  return { email: user.email };
}

/**
 * Sets a new password with a reset link. The link works once: using it deletes every reset link
 * of the account, so older emails stop working too. It also logs the account out everywhere and
 * lifts a lock from failed logins, so the new password works right away.
 *
 * @param {string} token The token from the link.
 * @param {string} password The new password, already checked against the password rules.
 * @returns {Promise<void>}
 * @throws {AppError} 400 RESET_LINK_INVALID when the link is unknown, expired, or used.
 */
export async function resetPassword(token, password) {
  const link = await findUsableLink(token);
  if (!link) throw linkInvalid();

  const passwordHash = await hashPassword(password);
  const claimed = await PasswordResetToken.findOneAndDelete({ _id: link._id });
  if (!claimed || claimed.expiresAt <= new Date()) throw linkInvalid();

  const { matchedCount } = await User.updateOne(
    { _id: link.user, isActive: true },
    { $set: { passwordHash } },
  );
  if (matchedCount === 0) throw linkInvalid();

  await PasswordResetToken.deleteMany({ user: link.user });
  await endAllSessions(link.user);
  const user = await User.findOne({ _id: link.user }, "email");
  if (user) await clearLoginFailures(user.email);
  logger.info("Password reset", { userId: String(link.user) });
}
