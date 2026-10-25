import { GYM_REQUEST_STATUS, GYM_REQUEST_TYPE } from "../constants/gymRequests.js";
import { ROLES } from "../constants/roles.js";
import { Gym } from "../models/Gym.js";
import { GymAdminRequest } from "../models/GymAdminRequest.js";
import { User } from "../models/User.js";

/**
 * Load counts on the System Administrator dashboard.
 *
 * @returns {Promise<{ gyms: { total: number, active: number, pending: number, inactive: number }, users: { total: number, admins: number, gymAdmins: number, climbers: number }, pendingRequests: { total: number, newGyms: number, existingGyms: number } }>}
 */
export async function getAdminDashboardSummary() {
  const [
    totalGyms,
    activeGyms,
    pendingGyms,
    inactiveGyms,
    totalUsers,
    adminUsers,
    gymAdminUsers,
    climberUsers,
    totalPendingRequests,
    pendingNewGymRequests,
    pendingExistingGymRequests,
  ] = await Promise.all([
    Gym.countDocuments(),
    Gym.countDocuments({ status: "ACTIVE" }),
    Gym.countDocuments({ status: "PENDING" }),
    Gym.countDocuments({ status: "INACTIVE" }),
    User.countDocuments(),
    User.countDocuments({ role: ROLES.ADMIN }),
    User.countDocuments({ role: ROLES.GYM_ADMIN }),
    User.countDocuments({ role: ROLES.CLIMBER }),
    GymAdminRequest.countDocuments({ status: GYM_REQUEST_STATUS.PENDING }),
    GymAdminRequest.countDocuments({
      status: GYM_REQUEST_STATUS.PENDING,
      requestType: GYM_REQUEST_TYPE.NEW_GYM,
    }),
    GymAdminRequest.countDocuments({
      status: GYM_REQUEST_STATUS.PENDING,
      requestType: GYM_REQUEST_TYPE.EXISTING_GYM,
    }),
  ]);

  return {
    gyms: {
      total: totalGyms,
      active: activeGyms,
      pending: pendingGyms,
      inactive: inactiveGyms,
    },
    users: {
      total: totalUsers,
      admins: adminUsers,
      gymAdmins: gymAdminUsers,
      climbers: climberUsers,
    },
    pendingRequests: {
      total: totalPendingRequests,
      newGyms: pendingNewGymRequests,
      existingGyms: pendingExistingGymRequests,
    },
  };
}
