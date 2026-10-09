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

/** US-006 #6.1: called by gymAdminController.assignGymAdmin.
 * Gym.adminIds is the existing authoritative relationship used by
 * gymService.getGymById and US-005's administrator display. No duplicate user-side
 * relationship is added, avoiding inconsistent updates across two documents.
 * An active GYM_ADMIN account and an APPROVED request for this exact gym are
 * required. US-035 owns approval/role setup; this function never grants a role.
 * $addToSet atomically prevents duplicate assignments, including concurrent calls.
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

/** US-006 #6.2: called by gymAdminController.removeGymAdmin.
 * $pull removes only userId from the selected Gym.adminIds. It does not delete
 * the account, change its role/activity, revoke approval history, or modify any
 * other gym. Removal works for stale/inactive accounts too, so ADMIN can clean
 * existing assignments. Repeated removal is idempotent and returns the gym.
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
