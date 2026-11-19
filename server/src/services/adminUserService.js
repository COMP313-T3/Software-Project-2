import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../constants/roles.js";
import { User } from "../models/User.js";
import { normalizePostalCode, postalCodeMessage } from "../utils/postalCodes.js";
import { endAllSessions } from "./sessionService.js";

const DEACTIVATABLE_ROLES = [ROLES.CLIMBER, ROLES.GYM_ADMIN];
const USER_DETAILS =
  "firstName lastName email role isActive dateOfBirth gender phone address postalCode country location createdAt updatedAt";

function deactivationForbidden() {
  return new AppError(
    403,
    "USER_DEACTIVATION_FORBIDDEN",
    "This account cannot be deactivated.",
  );
}

/**
 * Deactivates one eligible account without deleting its records.
 *
 * @param {string} userId The selected account's ID.
 * @param {string} actorUserId The authenticated ADMIN's ID.
 * @returns {Promise<{ userId: string, isActive: false }>} The updated account status.
 * @throws {AppError} 400 INVALID_USER_ID, 403 USER_DEACTIVATION_FORBIDDEN, 404 USER_NOT_FOUND,
 *   or 409 USER_ALREADY_INACTIVE / USER_DEACTIVATION_CONFLICT.
 */
export async function deactivateUser(userId, actorUserId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(400, "INVALID_USER_ID", "Invalid user id.");
  }
  if (userId === actorUserId) throw deactivationForbidden();

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      role: mongoose.trusted({ $in: DEACTIVATABLE_ROLES }),
      isActive: true,
    },
    { $set: { isActive: false } },
    { returnDocument: "after", runValidators: true },
  )
    .select("_id isActive")
    .lean();

  if (updatedUser) {
    await endAllSessions(updatedUser._id);
    return { userId: String(updatedUser._id), isActive: updatedUser.isActive };
  }

  const currentUser = await User.findById(userId, "role isActive").lean();
  if (!currentUser) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  }
  if (
    !DEACTIVATABLE_ROLES.includes(currentUser.role) ||
    userId === actorUserId
  ) {
    throw deactivationForbidden();
  }
  if (!currentUser.isActive) {
    throw new AppError(
      409,
      "USER_ALREADY_INACTIVE",
      "This account is already inactive.",
    );
  }

  throw new AppError(
    409,
    "USER_DEACTIVATION_CONFLICT",
    "The account changed before it could be deactivated. Try again.",
  );
}

function userNotFound() {
  return new AppError(404, "USER_NOT_FOUND", "User not found.");
}

function invalidPostalCode(country) {
  return new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
    postalCode: postalCodeMessage(country),
  });
}

function emailTaken() {
  const message = "This email already has an account. Try another email.";
  return new AppError(409, "EMAIL_TAKEN", message, { email: message });
}

/**
 * Updates permitted profile information for one user. Role and permission changes are rejected
 * by updateUserSchema until their permitted transitions are defined.
 *
 * @param {string} userId The selected account's ID.
 * @param {object} details Validated profile fields.
 * @returns {Promise<object>} The updated public account details.
 * @throws {AppError} 404 USER_NOT_FOUND, 400 VALIDATION_ERROR, or 409 EMAIL_TAKEN.
 */
export async function updateUser(userId, details) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(400, "INVALID_USER_ID", "Invalid user id.");
  }

  const currentUser = await User.findById(userId, "country postalCode").lean();
  if (!currentUser) throw userNotFound();

  const country = details.country ?? currentUser.country;
  const postalCodeInput = details.postalCode ?? currentUser.postalCode;
  const normalizedPostalCode = postalCodeInput
    ? normalizePostalCode(postalCodeInput, country)
    : null;

  if (postalCodeInput && !normalizedPostalCode) {
    throw invalidPostalCode(country);
  }

  const changes = { ...details };
  if (details.location) {
    changes.location = {
      type: "Point",
      coordinates: [details.location.lng, details.location.lat],
    };
  }
  if (details.location === null) changes.location = null;
  if (
    postalCodeInput &&
    (details.country !== undefined || details.postalCode !== undefined)
  ) {
    changes.postalCode = normalizedPostalCode;
  }

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: changes },
      { returnDocument: "after", runValidators: true },
    )
      .select(USER_DETAILS)
      .lean();
    if (!user) throw userNotFound();
    return user;
  } catch (error) {
    if (error?.code === 11000) throw emailTaken();
    throw error;
  }
}
