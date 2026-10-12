import mongoose from "mongoose";
import { Gym } from "../models/Gym.js";
import { User } from "../models/User.js";
import { GymAdminRequest } from "../models/GymAdminRequest.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";

function validateIds(gymId, userId) {
  if (!/^[a-f\d]{24}$/i.test(gymId) || !/^[a-f\d]{24}$/i.test(userId)) {
    throw new AppError(400, "INVALID_ASSIGNMENT_ID", "Invalid gym or user id.");
  }
}

/**
 * Assigns a Gym Administrator to a gym (US-006). The account must be an active GYM_ADMIN with an
 * APPROVED request for this gym; its role is never changed here. Gym.adminIds is the only record
 * of who administers a gym, and $addToSet keeps one entry per person even when two requests
 * arrive at once.
 *
 * @param {string} gymId The gym's ID.
 * @param {string} userId The account's ID.
 * @returns {Promise<object>} The gym with its administrators' names and emails.
 * @throws {AppError} 400 INVALID_ASSIGNMENT_ID, 404 GYM_NOT_FOUND or USER_NOT_FOUND, 409
 *   GYM_ADMIN_REQUIRED, or 403 GYM_ADMIN_NOT_APPROVED.
 */
export async function assignGymAdmin(gymId, userId) {
  validateIds(gymId, userId);
  if (!await Gym.exists({ _id: gymId })) {
    throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
  }
  const user = await User.findById(userId).select("role isActive").lean();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (user.role !== ROLES.GYM_ADMIN || !user.isActive) {
    throw new AppError(409, "GYM_ADMIN_REQUIRED", "Choose an active Gym Administrator account.");
  }
  const approval = await GymAdminRequest.exists({ userId, gymId, status: "APPROVED" });
  if (!approval) {
    throw new AppError(403, "GYM_ADMIN_NOT_APPROVED", "This Gym Administrator is not approved for this gym.");
  }
  const gym = await Gym.findByIdAndUpdate(
    gymId,
    { $addToSet: { adminIds: new mongoose.Types.ObjectId(userId) } },
    { returnDocument: "after", runValidators: true },
  ).populate("adminIds", "firstName lastName email").lean();
  if (!gym) throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
  return gym;
}

/**
 * Removes a Gym Administrator from one gym (US-006). The account, its role, its approval history
 * and its other gyms are unchanged. It also works for inactive accounts, and removing someone
 * twice is harmless.
 *
 * @param {string} gymId The gym's ID.
 * @param {string} userId The account's ID.
 * @returns {Promise<object>} The gym with its remaining administrators.
 * @throws {AppError} 400 INVALID_ASSIGNMENT_ID or 404 GYM_NOT_FOUND.
 */
export async function removeGymAdmin(gymId, userId) {
  validateIds(gymId, userId);
  const gym = await Gym.findByIdAndUpdate(
    gymId,
    { $pull: { adminIds: new mongoose.Types.ObjectId(userId) } },
    { returnDocument: "after", runValidators: true },
  ).populate("adminIds", "firstName lastName email").lean();
  if (!gym) throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
  return gym;
}

/**
 * The accounts an ADMIN can assign to a gym (US-006 criterion 3): active GYM_ADMIN accounts with
 * an APPROVED request for this gym that aren't assigned to it yet, sorted by name.
 *
 * @param {string} gymId The gym's ID.
 * @returns {Promise<{ _id: unknown, firstName: string, lastName: string, email: string }[]>}
 *   The accounts.
 * @throws {AppError} 404 GYM_NOT_FOUND.
 */
export async function listAdminCandidates(gymId) {
  const gym = await Gym.findById(gymId, "adminIds").lean();
  if (!gym) throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");

  const approved = await GymAdminRequest.distinct("userId", {
    gymId,
    status: "APPROVED",
  });
  const assigned = new Set(gym.adminIds.map(String));
  const waiting = approved.filter((id) => !assigned.has(String(id)));
  if (waiting.length === 0) return [];

  return User.find(
    {
      _id: mongoose.trusted({ $in: waiting }),
      role: ROLES.GYM_ADMIN,
      isActive: true,
    },
    "firstName lastName email",
  )
    .sort({ firstName: 1, lastName: 1 })
    .lean();
}

/**
 * One Gym Administrator assigned to a gym, for the read-only details view (US-006 criterion 6):
 * their name, email, role, whether the account is active, when it was created, and every gym they
 * administer.
 *
 * @param {string} gymId The gym the Admin opened the account from.
 * @param {string} userId The Gym Administrator's ID.
 * @returns {Promise<object>} The account and its gyms ({ _id, name, location, status }).
 * @throws {AppError} 400 INVALID_ASSIGNMENT_ID, 404 GYM_NOT_FOUND, or 404 GYM_ADMIN_NOT_FOUND
 *   when the account isn't assigned to that gym.
 */
export async function getGymAdmin(gymId, userId) {
  validateIds(gymId, userId);
  if (!(await Gym.exists({ _id: gymId }))) {
    throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
  }
  const notAssigned = new AppError(
    404,
    "GYM_ADMIN_NOT_FOUND",
    "This Gym Administrator isn't assigned to this gym.",
  );
  if (!(await Gym.exists({ _id: gymId, adminIds: userId }))) throw notAssigned;

  const [user, gyms] = await Promise.all([
    User.findById(userId, "firstName lastName email role isActive createdAt").lean(),
    Gym.find({ adminIds: userId }, "name location status").sort({ name: 1 }).lean(),
  ]);
  if (!user) throw notAssigned;

  return { ...user, gyms };
}
