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

function invalidGymId() {
  return new AppError(400, "INVALID_GYM_ID", "Invalid gym id.");
}

function gymNotFound() {
  return new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
}

function validateGymId(gymId) {
  if (!mongoose.isValidObjectId(gymId)) throw invalidGymId();
}

function populatedGym(query) {
  return query.populate("adminIds", "firstName lastName email").lean();
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
  validateGymId(gymId);

  const gym = await populatedGym(Gym.findById(gymId));
  if (!gym) throw gymNotFound();

  return gym;
}

/**
 * Updates the editable details of one gym (US-005), leaving its status and assigned
 * administrators unchanged.
 *
 * @param {string} gymId The gym's ID.
 * @param {{ name?: string, location?: string }} details Validated fields to update.
 * @returns {Promise<object>} The updated gym, including assigned administrators.
 * @throws {AppError} 400 INVALID_GYM_ID, 404 GYM_NOT_FOUND, or 409 GYM_EXISTS.
 */
export async function updateGym(gymId, details) {
  validateGymId(gymId);

  const current = await Gym.findById(gymId).lean();
  if (!current) throw gymNotFound();

  const name = details.name ?? current.name;
  const location = details.location ?? current.location;
  const duplicate = await Gym.findOne({
    _id: { $ne: current._id },
    name,
    location,
  })
    .collation(CASE_INSENSITIVE)
    .lean();
  if (duplicate) throw gymExists();

  try {
    const gym = await populatedGym(
      Gym.findByIdAndUpdate(
        gymId,
        { $set: details },
        { new: true, runValidators: true },
      ),
    );
    if (!gym) throw gymNotFound();
    return gym;
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) throw gymExists();
    throw error;
  }
}

/**
 * Deactivates one gym without removing its records or administrator assignments (US-005).
 *
 * @param {string} gymId The gym's ID.
 * @returns {Promise<object>} The inactive gym, including assigned administrators.
 * @throws {AppError} 400 INVALID_GYM_ID or 404 GYM_NOT_FOUND.
 */
export async function deactivateGym(gymId) {
  validateGymId(gymId);

  const gym = await populatedGym(
    Gym.findByIdAndUpdate(
      gymId,
      { $set: { status: "INACTIVE" } },
      { new: true, runValidators: true },
    ),
  );
  if (!gym) throw gymNotFound();

  return gym;
}