import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import {
  GYM_ADMIN_SETUP_LINK_LIFETIME_MS,
  GYM_REQUEST_STATUS,
} from "../constants/gymRequests.js";
import { ROLES } from "../constants/roles.js";
import { Gym } from "../models/Gym.js";
import { GymAdminRequest } from "../models/GymAdminRequest.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { assignGymAdmin } from "./gymAdminService.js";
import { hashPassword } from "./passwordService.js";

const TOKEN_BYTES = 32;

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function linkInvalid() {
  return new AppError(
    400,
    "SETUP_LINK_INVALID",
    "This setup link has expired or was already used. Contact TopSend to get a new one.",
  );
}

function emailTaken() {
  const message =
    "This email already has a TopSend account. Contact TopSend so an Administrator can help.";
  return new AppError(409, "EMAIL_TAKEN", message, { email: message });
}

/**
 * Makes a new one-time account setup link for an approved request (US-035 criterion 6). Only the
 * token's SHA-256 hash is saved, so the database alone can't be used to set up the account.
 *
 * @param {string} appUrl The web app's address.
 * @returns {{ href: string, tokenHash: string, expiresAt: Date }} The link for the email, the
 *   hash to save, and when the link stops working.
 */
export function newSetupLink(appUrl) {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const link = new URL(`${appUrl}/gym-admin/setup`);
  link.searchParams.set("token", token);
  return {
    href: link.href,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + GYM_ADMIN_SETUP_LINK_LIFETIME_MS),
  };
}

/** The APPROVED request a setup link belongs to, if the link still works. */
async function findUsableRequest(token) {
  const request = await GymAdminRequest.findOne({
    setupTokenHash: hashToken(token),
    status: GYM_REQUEST_STATUS.APPROVED,
  }).lean();
  const usable =
    request &&
    !request.setupCompletedAt &&
    !request.userId &&
    request.gymId &&
    request.setupLinkExpiresAt > new Date();
  return usable ? request : null;
}

/**
 * Checks a setup link before the applicant chooses a password, and says whose account it sets up.
 *
 * @param {string} token The token from the link.
 * @returns {Promise<{ firstName: string, lastName: string, email: string, gym: { name: string, location: string } | null }>}
 * @throws {AppError} 400 SETUP_LINK_INVALID when the link is unknown, expired, or used.
 */
export async function checkSetupLink(token) {
  const request = await findUsableRequest(token);
  if (!request) throw linkInvalid();

  const gym = await Gym.findById(request.gymId, "name location").lean();
  return {
    firstName: request.contact.firstName,
    lastName: request.contact.lastName,
    email: request.contact.email,
    gym: gym ? { name: gym.name, location: gym.location } : null,
  };
}

/**
 * Sets up an approved applicant's account (US-035 criterion 6, AC-005). It creates an active
 * GYM_ADMIN account with the name, email, and phone from the request and the chosen password,
 * records it on the request, and assigns it to the request's gym, so it can manage that gym's
 * competitions after logging in. The link works once.
 *
 * Only an APPROVED request's link gets here, so a PENDING or REJECTED request can never give
 * GYM_ADMIN access (criterion 7).
 *
 * @param {string} token The token from the link.
 * @param {string} password The new password, already checked against the password rules.
 * @returns {Promise<object>} The new account and its gym.
 * @throws {AppError} 400 SETUP_LINK_INVALID, or 409 EMAIL_TAKEN when the email got an account
 *   since the request was approved.
 */
export async function completeGymAdminSetup(token, password) {
  const request = await findUsableRequest(token);
  if (!request) throw linkInvalid();

  const { contact } = request;
  if (await User.exists({ email: contact.email })) throw emailTaken();

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await User.create({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      passwordHash,
      role: ROLES.GYM_ADMIN,
      isActive: true,
    });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) throw emailTaken();
    throw error;
  }

  // Use up the link. If it was used or renewed meanwhile, the new account is removed again.
  const claimed = await GymAdminRequest.findOneAndUpdate(
    {
      _id: request._id,
      setupTokenHash: hashToken(token),
      status: GYM_REQUEST_STATUS.APPROVED,
      // Server-built conditions, trusted past sanitizeFilter.
      setupLinkExpiresAt: mongoose.trusted({ $gt: new Date() }),
      setupCompletedAt: mongoose.trusted({ $exists: false }),
    },
    {
      $set: { userId: user._id, setupCompletedAt: new Date() },
      $unset: { setupTokenHash: 1, setupLinkExpiresAt: 1 },
    },
    { returnDocument: "after" },
  ).lean();
  if (!claimed) {
    await User.deleteOne({ _id: user._id });
    throw linkInvalid();
  }

  // Criteria 4 and 5: connects the account to its gym. assignGymAdmin checks the account is an
  // active GYM_ADMIN with an APPROVED request for this gym, which is now true.
  const gym = await assignGymAdmin(String(claimed.gymId), String(user._id));

  logger.info("Gym Admin account set up", {
    userId: String(user._id),
    gymRequestId: String(request._id),
    gymId: String(claimed.gymId),
  });

  return {
    status: "ACCOUNT_CREATED",
    message: "Your Gym Administrator account is ready. Log in with your email and new password.",
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
    gym: { _id: gym._id, name: gym.name, location: gym.location, status: gym.status },
  };
}
