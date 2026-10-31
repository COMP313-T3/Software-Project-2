import mongoose from "mongoose";
import { ACCOUNT_ROLES, ROLES } from "../constants/roles.js";
import {
  ROLE_LABELS,
  USER_SEARCH_MAX_WORDS,
  USER_SORT,
  USER_SORT_OPTIONS,
  USER_STATUS_FILTER,
  USER_STATUS_OPTIONS,
} from "../constants/users.js";
import { Gym } from "../models/Gym.js";
import { Registration } from "../models/Registration.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { fromGeoPoint } from "../utils/geoPoints.js";

/** Compares text ignoring case, so "anna" and "Anna" sort together. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * What one row of the list shows. No password hash, and none of a Climber's private profile
 * (birth date, address, phone, location): those are only on the details page.
 */
const LIST_FIELDS = "firstName lastName email role isActive createdAt";

/** What the details page shows. The password hash is never read. */
const DETAIL_FIELDS =
  "firstName lastName email role isActive createdAt updatedAt phone dateOfBirth gender " +
  "address postalCode country location termsAcceptedAt termsVersion";

/** The orders, as MongoDB sorts. _id last, so accounts that tie keep one order across pages. */
const SORTS = Object.freeze({
  [USER_SORT.NAME]: { lastName: 1, firstName: 1, _id: 1 },
  [USER_SORT.EMAIL]: { email: 1, _id: 1 },
  [USER_SORT.NEWEST]: { createdAt: -1, _id: -1 },
  [USER_SORT.OLDEST]: { createdAt: 1, _id: 1 },
});

function userNotFound() {
  return new AppError(404, "USER_NOT_FOUND", "User not found.");
}

function gymNotFound() {
  return new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
}

/** Escapes text so it's searched for literally, never run as a regular expression. */
function literal(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** YYYY-MM-DD, so a birth date stored at midnight UTC doesn't show as the day before. */
function calendarDate(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

/**
 * The search text as a filter (criterion 2). Every word must appear in the first name, last name,
 * or email, ignoring case, so "sam hogtown" finds Sam Lee at sam@hogtown.ca. A word that's a whole
 * account ID also matches that account, so an ID copied from a log finds its user.
 */
function searchFilter(q) {
  const words = q.split(/\s+/).filter(Boolean).slice(0, USER_SEARCH_MAX_WORDS);
  return words.map((word) => {
    // Built by the server, with the text escaped, so these operators are trusted past
    // sanitizeFilter.
    const text = () => mongoose.trusted({ $regex: literal(word), $options: "i" });
    return {
      $or: [
        { firstName: text() },
        { lastName: text() },
        { email: text() },
        ...(OBJECT_ID.test(word) ? [{ _id: word.toLowerCase() }] : []),
      ],
    };
  });
}

/**
 * The MongoDB filter for the validated query (criteria 2 and 3). Every account is a registered
 * TopSend user, so with no search or filter every account matches.
 *
 * @returns {Promise<object>} The filter.
 * @throws {AppError} 404 GYM_NOT_FOUND when gymId names no gym.
 */
async function usersFilter({ q, role, status, gymId }) {
  const filter = {};
  if (role) filter.role = role;
  if (status === USER_STATUS_FILTER.ACTIVE) filter.isActive = true;
  if (status === USER_STATUS_FILTER.INACTIVE) filter.isActive = false;
  if (gymId) {
    const gym = await Gym.findById(gymId, "adminIds").lean();
    if (!gym) throw gymNotFound();
    // Built by the server from the gym's stored administrators, so it's trusted.
    filter._id = mongoose.trusted({ $in: gym.adminIds });
  }
  if (q) filter.$and = searchFilter(q);
  return filter;
}

/** The gyms each Gym Administrator manages, keyed by user ID, as { _id, name, status }. */
async function gymsOf(userIds) {
  const byUser = new Map(userIds.map((id) => [String(id), []]));
  if (userIds.length === 0) return byUser;
  const gyms = await Gym.find(
    // Built by the server from the IDs just loaded, so the operator is trusted.
    { adminIds: mongoose.trusted({ $in: userIds }) },
    "name status adminIds",
  )
    .collation(CASE_INSENSITIVE)
    .sort({ name: 1 })
    .lean();
  for (const gym of gyms) {
    for (const adminId of gym.adminIds) {
      byUser.get(String(adminId))?.push({ _id: gym._id, name: gym.name, status: gym.status });
    }
  }
  return byUser;
}

/** One row of the list: who the account is, its role, whether it's active, and when it was made. */
function presentSummary(user, gymsByUser) {
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    // The gyms a Gym Administrator manages, so the list shows which gym they belong to.
    gyms: user.role === ROLES.GYM_ADMIN ? gymsByUser.get(String(user._id)) ?? [] : [],
  };
}

/**
 * The Manage Users list (US-008 criteria 1 to 3): registered TopSend accounts that match the
 * search and filters, one page at a time, by name unless another order is chosen.
 *
 * @param {{ q?: string, role?: string, status: string, gymId?: string, sort: string, page: number, limit: number }} query
 *   The validated query.
 * @returns {Promise<{ users: object[], total: number, page: number, limit: number }>}
 * @throws {AppError} 404 GYM_NOT_FOUND when gymId names no gym.
 */
export async function listUsers(query) {
  const { sort = USER_SORT.NAME, page = 1, limit = 20 } = query;
  const filter = await usersFilter(query);

  const [users, total] = await Promise.all([
    User.find(filter, LIST_FIELDS)
      .collation(CASE_INSENSITIVE)
      .sort(SORTS[sort] ?? SORTS[USER_SORT.NAME])
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const gymAdminIds = users.filter((user) => user.role === ROLES.GYM_ADMIN).map((user) => user._id);
  const gymsByUser = await gymsOf(gymAdminIds);
  return {
    users: users.map((user) => presentSummary(user, gymsByUser)),
    total,
    page,
    limit,
  };
}

/**
 * The choices the Manage Users page offers (criterion 3): roles, account statuses, orders, and
 * the gyms that have Gym Administrators, for the gym filter.
 *
 * @returns {Promise<{ roles: object[], statuses: readonly object[], sorts: readonly object[], gyms: object[] }>}
 */
export async function userFilterOptions() {
  const gyms = await Gym.find({ "adminIds.0": mongoose.trusted({ $exists: true }) }, "name status")
    .collation(CASE_INSENSITIVE)
    .sort({ name: 1 })
    .lean();
  return {
    roles: ACCOUNT_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
    statuses: USER_STATUS_OPTIONS,
    sorts: USER_SORT_OPTIONS,
    gyms: gyms.map(({ _id, name, status }) => ({ _id, name, status })),
  };
}

/**
 * One account, opened from the list (US-008 criteria 4 and 5). It shows the account itself and
 * what belongs to its role: a Climber's sign-up profile and how many competitions they registered
 * for, or the gyms a Gym Administrator manages. A Climber's saved map location is only reported as
 * saved or not, never as coordinates. Editing is US-009 (and US-007 for Gym Administrators).
 *
 * @param {string} userId The validated account ID.
 * @returns {Promise<object>} The account.
 * @throws {AppError} 404 USER_NOT_FOUND.
 */
export async function getUserDetails(userId) {
  const user = await User.findById(userId, DETAIL_FIELDS).lean();
  if (!user) throw userNotFound();

  const [gymsByUser, registrations] = await Promise.all([
    user.role === ROLES.GYM_ADMIN ? gymsOf([user._id]) : null,
    user.role === ROLES.CLIMBER ? Registration.countDocuments({ climberId: user._id }) : null,
  ]);

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    climber:
      user.role === ROLES.CLIMBER
        ? {
            dateOfBirth: calendarDate(user.dateOfBirth),
            gender: user.gender ?? null,
            address: user.address ?? null,
            postalCode: user.postalCode ?? null,
            country: user.country ?? null,
            hasSavedLocation: fromGeoPoint(user.location) !== null,
            termsVersion: user.termsVersion ?? null,
            termsAcceptedAt: user.termsAcceptedAt ?? null,
            registrationCount: registrations,
          }
        : null,
    gymAdmin:
      user.role === ROLES.GYM_ADMIN
        ? { gyms: gymsByUser.get(String(user._id)) ?? [] }
        : null,
  };
}
