import mongoose from "mongoose";
import { Gym } from "../models/Gym.js";

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Create a gym. Also reused by US-035 when an approved
 * NEW_GYM request needs a registered gym record (AC-5).
 */
export async function createGym({ name, location, status = "ACTIVE" }) {
  // Block duplicates (same name + location, case-insensitive)
  const existing = await Gym.findOne({ name, location }).collation({
    locale: "en",
    strength: 2,
  });
  if (existing) throw httpError(409, "A gym with this name and location already exists");

  return Gym.create({ name, location, status });
}

/** List gyms with optional status filter and pagination. */
export async function listGyms({ status, page = 1, limit = 20 } = {}) {
  const filter = status ? { status } : {};

  const [gyms, total] = await Promise.all([
    Gym.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Gym.countDocuments(filter),
  ]);

  return { gyms, total, page, limit };
}

/** Get one gym for the Gym Details page (US-005 builds on this). */
export async function getGymById(gymId) {
  if (!mongoose.isValidObjectId(gymId)) throw httpError(400, "Invalid gym id");

  const gym = await Gym.findById(gymId)
    .populate("adminIds", "firstName lastName email") // confirm these field names in User.js
    .lean();
  if (!gym) throw httpError(404, "Gym not found");

  return gym;
}