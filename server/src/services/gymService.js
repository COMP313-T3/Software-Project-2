import mongoose from "mongoose";
import { DEFAULT_PAGE_SIZE } from "../constants/gyms.js";
import { Gym } from "../models/Gym.js";
import { AppError } from "../utils/AppError.js";

/** Compares text ignoring case, so "Hogtown Boulders" and "hogtown boulders" match. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

function gymExists() {
  return new AppError(
    409,
    "GYM_EXISTS",
    "A gym with this name and location already exists.",
  );
}

/**
 * Registers a gym (US-004). Also used by US-035 when an ADMIN approves a NEW_GYM request:
 * call this, then save the returned gym's _id in the request's gymId.
 *
 * @param {{ name: string, location: string, status?: "PENDING" | "ACTIVE" | "INACTIVE" }} details
 *   Validated gym details. A gym added by an ADMIN is ACTIVE unless a status is given.
 * @returns {Promise<object>} The saved gym.
 * @throws {AppError} 409 GYM_EXISTS when a gym with the same name and location is registered.
 */
export async function createGym({ name, location, status = "ACTIVE" }) {
  const existing = await Gym.findOne({ name, location })
    .collation(CASE_INSENSITIVE)
    .lean();
  if (existing) throw gymExists();

  try {
    const gym = await Gym.create({ name, location, status });
    return gym.toObject();
  } catch (error) {
    // Only happens if a unique index is added to Gym.js and two requests race.
    if (error?.code === DUPLICATE_KEY) throw gymExists();
    throw error;
  }
}

/**
 * Lists registered gyms by name, one page at a time (US-004).
 *
 * @param {{ status?: "PENDING" | "ACTIVE" | "INACTIVE", page?: number, limit?: number }} [query]
 *   Validated query: an optional status filter and paging.
 * @returns {Promise<{ gyms: object[], total: number, page: number, limit: number }>}
 *   The page of gyms and the total number that match the filter.
 */
export async function listGyms({
  status,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
} = {}) {
  const filter = status ? { status } : {};

  const [gyms, total] = await Promise.all([
    Gym.find(filter)
      .collation(CASE_INSENSITIVE)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Gym.countDocuments(filter),
  ]);

  return { gyms, total, page, limit };
}

/**
 * Finds one gym for the Gym Details page (US-004, built on by US-005), with its
 * Gym Administrators' names and emails in place of their IDs.
 *
 * @param {string} gymId The gym's ID.
 * @returns {Promise<object>} The gym.
 * @throws {AppError} 400 INVALID_GYM_ID for a malformed ID, or 404 GYM_NOT_FOUND.
 */
export async function getGymById(gymId) {
  if (!mongoose.isValidObjectId(gymId)) {
    throw new AppError(400, "INVALID_GYM_ID", "Invalid gym id.");
  }

  const gym = await Gym.findById(gymId)
    // Check these field names against User.js.
    .populate("adminIds", "firstName lastName email")
    .lean();
  if (!gym) throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");

  return gym;
}