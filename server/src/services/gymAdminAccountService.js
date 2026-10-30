import mongoose from "mongoose";
import { COMPETITION_STATUS } from "../constants/competitions.js";
import { GYM_REQUEST_STATUS } from "../constants/gymRequests.js";
import { ROLES } from "../constants/roles.js";
import { Competition } from "../models/Competition.js";
import { Gym } from "../models/Gym.js";
import { GymAdminRequest } from "../models/GymAdminRequest.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { logger } from "../utils/logger.js";
import { assignGymAdmin } from "./gymAdminService.js";
import { endAllSessions } from "./sessionService.js";

/** Only an ACTIVE gym's competitions can be managed (requireGymAdmin). */
const ACTIVE_GYM = "ACTIVE";

/** Compares text ignoring case, for sorting gym names. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

/** What the Administrator Details page shows about the account. Never the password hash. */
const ACCOUNT_FIELDS = "firstName lastName email phone role isActive createdAt updatedAt";

const GYM_FIELDS = "name location status";

function gymAdminNotFound() {
  // The same answer for an ID nobody has and for an account that isn't a Gym Administrator, so
  // these routes can't be used to look up Climbers or System Administrators.
  return new AppError(404, "GYM_ADMIN_NOT_FOUND", "Gym Administrator not found.");
}

function gymNotFound() {
  return new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
}

function emailTaken() {
  const message = "This email already belongs to another TopSend account.";
  return new AppError(409, "EMAIL_TAKEN", message, { email: message });
}

function notAssigned(gym) {
  return new AppError(
    409,
    "GYM_ACCESS_NOT_FOUND",
    `This Gym Administrator doesn't manage ${gym.name}, so there's nothing to remove.`,
  );
}

function lastActiveAdmin(user, gym) {
  return new AppError(
    409,
    "LAST_GYM_ADMIN",
    `${user.firstName} ${user.lastName} is the only active Gym Administrator of ${gym.name}, which ` +
      "has upcoming competitions. Assign another Gym Administrator to the gym first, or deactivate " +
      "the gym.",
  );
}

function pickGym(gym) {
  return { _id: gym._id, name: gym.name, location: gym.location, status: gym.status };
}

/** Today in Toronto, as the midnight-UTC Date that competition dates are stored as. */
function today() {
  return parseCalendarDate(torontoToday()).date;
}

async function findGymAdmin(userId, fields = ACCOUNT_FIELDS) {
  const user = await User.findOne({ _id: userId, role: ROLES.GYM_ADMIN }, fields).lean();
  if (!user) throw gymAdminNotFound();
  return user;
}

/** The IDs, among these, of accounts that are active Gym Administrators. */
async function activeGymAdminIds(userIds) {
  if (userIds.length === 0) return new Set();
  const users = await User.find(
    {
      // Built by the server from stored IDs, so the operator is trusted past sanitizeFilter.
      _id: mongoose.trusted({ $in: userIds }),
      role: ROLES.GYM_ADMIN,
      isActive: true,
    },
    "_id",
  ).lean();
  return new Set(users.map((user) => String(user._id)));
}

/**
 * The ACTIVE gyms this account manages that would have no other active Gym Administrator without
 * it. Their competitions can't be managed by anyone while it's deactivated.
 */
async function gymsOnlyManagedBy(userId) {
  const gyms = await Gym.find(
    { adminIds: userId, status: ACTIVE_GYM },
    `${GYM_FIELDS} adminIds`,
  ).lean();
  const others = (gym) => gym.adminIds.filter((id) => String(id) !== String(userId));
  const active = await activeGymAdminIds(gyms.flatMap(others));
  return gyms
    .filter((gym) => !others(gym).some((id) => active.has(String(id))))
    .map(pickGym);
}

/**
 * Everything the Administrator Details page shows (US-007 criterion 1, US-006 criterion 6): the
 * account, the gyms it manages, the gyms it was approved for but isn't assigned to (which can be
 * added back), and whether it can manage competitions right now.
 */
async function presentAccount(user) {
  const [gyms, approvedIds] = await Promise.all([
    Gym.find({ adminIds: user._id }, GYM_FIELDS).collation(CASE_INSENSITIVE).sort({ name: 1 }).lean(),
    GymAdminRequest.distinct("gymId", {
      userId: user._id,
      status: GYM_REQUEST_STATUS.APPROVED,
    }),
  ]);

  const assigned = new Set(gyms.map((gym) => String(gym._id)));
  const notAssignedIds = approvedIds.filter((id) => id && !assigned.has(String(id)));
  const approvedGyms =
    notAssignedIds.length === 0
      ? []
      : await Gym.find(
          // Built by the server from stored IDs, so the operator is trusted past sanitizeFilter.
          { _id: mongoose.trusted({ $in: notAssignedIds }) },
          GYM_FIELDS,
        )
          .collation(CASE_INSENSITIVE)
          .sort({ name: 1 })
          .lean();

  const activeGymCount = gyms.filter((gym) => gym.status === ACTIVE_GYM).length;
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    gyms: gyms.map(pickGym),
    approvedGyms: approvedGyms.map(pickGym),
    access: {
      // Criterion 6: an inactive account can't use Gym Administrator features at all.
      canManageCompetitions: user.isActive && activeGymCount > 0,
      activeGymCount,
    },
  };
}

/**
 * One Gym Administrator account for the Administrator Details page (US-007 criterion 1).
 *
 * @param {string} userId The validated account ID.
 * @returns {Promise<object>} The account, its gyms, the approved gyms it isn't assigned to, and its
 *   access.
 * @throws {AppError} 404 GYM_ADMIN_NOT_FOUND when there's no GYM_ADMIN account with this ID.
 */
export async function getGymAdminAccount(userId) {
  return presentAccount(await findGymAdmin(userId));
}

/**
 * Saves the account details a System Administrator may correct (US-007 criterion 2): first and
 * last name, email, and phone (null removes it). The role, password, and active state are never
 * changed here. A new email must not belong to any other account, ignoring case, since it's how
 * the person logs in.
 *
 * @param {string} userId The validated account ID.
 * @param {string} adminId The System Administrator, for the log.
 * @param {{ firstName?: string, lastName?: string, email?: string, phone?: string | null }} changes
 *   The validated body.
 * @returns {Promise<object>} The account, as getGymAdminAccount answers it.
 * @throws {AppError} 404 GYM_ADMIN_NOT_FOUND, or 409 EMAIL_TAKEN.
 */
export async function updateGymAdminAccount(userId, adminId, changes) {
  const user = await findGymAdmin(userId, "email");

  const set = {};
  for (const field of ["firstName", "lastName", "email"]) {
    if (changes[field] !== undefined) set[field] = changes[field];
  }
  if (typeof changes.phone === "string") set.phone = changes.phone;
  const update = {
    ...(Object.keys(set).length > 0 ? { $set: set } : {}),
    ...(changes.phone === null ? { $unset: { phone: 1 } } : {}),
  };

  if (set.email && set.email !== user.email) {
    const taken = await User.exists({
      email: set.email,
      // A database ID, so the operator is trusted past sanitizeFilter.
      _id: mongoose.trusted({ $ne: user._id }),
    });
    if (taken) throw emailTaken();
  }

  let updated;
  try {
    updated = await User.findOneAndUpdate(
      { _id: user._id, role: ROLES.GYM_ADMIN },
      update,
      { returnDocument: "after", runValidators: true, projection: ACCOUNT_FIELDS },
    ).lean();
  } catch (error) {
    // Two accounts saved with the same email at once: the unique index stops the second.
    if (error?.code === DUPLICATE_KEY) throw emailTaken();
    throw error;
  }
  if (!updated) throw gymAdminNotFound();

  logger.info("Gym Admin account updated", {
    userId: String(user._id),
    updatedBy: String(adminId),
    fields: Object.keys(changes).filter((field) => changes[field] !== undefined),
  });
  return presentAccount(updated);
}

/**
 * Gives the account access to one more gym (US-007 criterion 3). As in US-006, the account must
 * be an active Gym Administrator with an APPROVED request for that gym, so access is only ever
 * given where a System Administrator approved it.
 *
 * @param {string} userId The validated account ID.
 * @param {string} gymId The validated gym ID.
 * @param {string} adminId The System Administrator, for the log.
 * @returns {Promise<{ message: string, account: object }>}
 * @throws {AppError} 404 GYM_ADMIN_NOT_FOUND or GYM_NOT_FOUND, 409 GYM_ADMIN_REQUIRED for an
 *   inactive account, or 403 GYM_ADMIN_NOT_APPROVED.
 */
export async function addGymAccess(userId, gymId, adminId) {
  const user = await findGymAdmin(userId);
  const gym = await assignGymAdmin(gymId, String(user._id));

  logger.info("Gym access added", {
    userId: String(user._id),
    gymId: String(gym._id),
    changedBy: String(adminId),
  });
  return {
    message: `${user.firstName} ${user.lastName} can now manage ${gym.name}.`,
    account: await presentAccount(user),
  };
}

/**
 * Removes the account from one gym (US-007 criterion 4). The account, its other gyms, and its
 * approval history stay, so the gym can be added back later. It's refused when the account doesn't
 * manage the gym, or when it's the gym's only active Gym Administrator and the gym is ACTIVE with
 * upcoming competitions, so a running event is never left without anyone to manage it. An
 * inactive account can always be removed, since it isn't managing anything.
 *
 * @param {string} userId The validated account ID.
 * @param {string} gymId The validated gym ID.
 * @param {string} adminId The System Administrator, for the log.
 * @returns {Promise<{ message: string, account: object }>}
 * @throws {AppError} 404 GYM_ADMIN_NOT_FOUND or GYM_NOT_FOUND, 409 GYM_ACCESS_NOT_FOUND, or 409
 *   LAST_GYM_ADMIN.
 */
export async function removeGymAccess(userId, gymId, adminId) {
  const user = await findGymAdmin(userId);
  const gym = await Gym.findById(gymId, "name status adminIds").lean();
  if (!gym) throw gymNotFound();
  if (!gym.adminIds.some((id) => String(id) === String(user._id))) throw notAssigned(gym);

  if (user.isActive && gym.status === ACTIVE_GYM) {
    const others = gym.adminIds.filter((id) => String(id) !== String(user._id));
    const anotherActive = (await activeGymAdminIds(others)).size > 0;
    if (!anotherActive) {
      const upcoming = await Competition.exists({
        gymId: gym._id,
        // Built by the server, so the operators are trusted past sanitizeFilter.
        date: mongoose.trusted({ $gte: today() }),
        status: mongoose.trusted({ $ne: COMPETITION_STATUS.CANCELLED }),
      });
      if (upcoming) throw lastActiveAdmin(user, gym);
    }
  }

  const updated = await Gym.findOneAndUpdate(
    { _id: gym._id, adminIds: user._id },
    { $pull: { adminIds: user._id } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw notAssigned(gym);

  logger.info("Gym access removed", {
    userId: String(user._id),
    gymId: String(gym._id),
    changedBy: String(adminId),
  });
  return {
    message: `${user.firstName} ${user.lastName} no longer manages ${gym.name}.`,
    account: await presentAccount(user),
  };
}

/**
 * Deactivates the account (US-007 criteria 5 and 6). It's logged out everywhere at once, can't
 * log in or refresh, and requireGymAdmin turns away any request it still makes, so it loses every
 * Gym Administrator feature straight away. Its gyms and approvals are kept, so activating it again
 * restores its access. Deactivating an inactive account changes nothing.
 *
 * gymsWithoutActiveAdmin lists the ACTIVE gyms that now have no active Gym Administrator, so the
 * Admin can assign someone.
 *
 * @param {string} userId The validated account ID.
 * @param {string} adminId The System Administrator, for the log.
 * @returns {Promise<{ message: string, account: object, gymsWithoutActiveAdmin: object[] }>}
 * @throws {AppError} 404 GYM_ADMIN_NOT_FOUND.
 */
export async function deactivateGymAdmin(userId, adminId) {
  const before = await User.findOneAndUpdate(
    { _id: userId, role: ROLES.GYM_ADMIN },
    { $set: { isActive: false } },
    { returnDocument: "before", projection: ACCOUNT_FIELDS },
  ).lean();
  if (!before) throw gymAdminNotFound();

  // Ends every login, so the account's refresh cookies and access tokens stop working now.
  await endAllSessions(before._id);
  if (before.isActive) {
    logger.info("Gym Admin deactivated", {
      userId: String(before._id),
      deactivatedBy: String(adminId),
    });
  }

  const name = `${before.firstName} ${before.lastName}`;
  return {
    message: before.isActive
      ? `${name}'s account is deactivated. They've been logged out and can't use Gym Administrator features.`
      : `${name}'s account was already deactivated.`,
    account: await presentAccount({ ...before, isActive: false }),
    gymsWithoutActiveAdmin: await gymsOnlyManagedBy(before._id),
  };
}

/**
 * Activates a deactivated account again. It gets back the gyms it was assigned to, and its
 * holder logs in again with their password. Activating an active account changes nothing.
 *
 * @param {string} userId The validated account ID.
 * @param {string} adminId The System Administrator, for the log.
 * @returns {Promise<{ message: string, account: object }>}
 * @throws {AppError} 404 GYM_ADMIN_NOT_FOUND.
 */
export async function activateGymAdmin(userId, adminId) {
  const before = await User.findOneAndUpdate(
    { _id: userId, role: ROLES.GYM_ADMIN },
    { $set: { isActive: true } },
    { returnDocument: "before", projection: ACCOUNT_FIELDS },
  ).lean();
  if (!before) throw gymAdminNotFound();
  if (!before.isActive) {
    logger.info("Gym Admin activated", {
      userId: String(before._id),
      activatedBy: String(adminId),
    });
  }

  const name = `${before.firstName} ${before.lastName}`;
  return {
    message: before.isActive
      ? `${name}'s account is already active.`
      : `${name}'s account is active again. They can log in and manage their gyms.`,
    account: await presentAccount({ ...before, isActive: true }),
  };
}
