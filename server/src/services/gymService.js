import mongoose from "mongoose";
import { DEFAULT_PAGE_SIZE } from "../constants/gyms.js";
import { Competition } from "../models/Competition.js";
import { Gym } from "../models/Gym.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { fromGeoPoint, toGeoPoint } from "../utils/geoPoints.js";

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
 * Shapes a gym for the API: its stored map point becomes coordinates ({ lat, lng }, or null when
 * the gym has no pin).
 *
 * @param {object} gym The gym, as a plain object.
 * @returns {object} The gym, with coordinates in place of mapPoint.
 */
export function presentGym(gym) {
  const { mapPoint, ...details } = gym;
  return { ...details, coordinates: fromGeoPoint(mapPoint) };
}

/**
 * Turns the validated PATCH body into a MongoDB update. coordinates becomes the stored map point,
 * and null removes the pin.
 */
function gymUpdate(changes) {
  const { coordinates, ...set } = changes;
  if (coordinates) set.mapPoint = toGeoPoint(coordinates);
  const update = Object.keys(set).length > 0 ? { $set: set } : {};
  if (coordinates === null) update.$unset = { mapPoint: 1 };
  return update;
}

/**
 * Gives the gym's competitions from today on, in Toronto, the gym's location, since a competition
 * is always held at its gym. Past competitions keep the location they were held at.
 */
function moveUpcomingCompetitions(gymId, location) {
  return Competition.updateMany(
    {
      gymId,
      // Built by the server from today's date and the saved location, so the operators are
      // trusted past sanitizeFilter.
      date: mongoose.trusted({ $gte: parseCalendarDate(torontoToday()).date }),
      location: mongoose.trusted({ $ne: location }),
    },
    { $set: { location } },
    { runValidators: true },
  );
}

/**
 * Gives every gym's competitions from today on, in Toronto, the gym's location. The API does this
 * when it starts, so competitions saved with a location of their own before they followed their
 * gym, or missed a change to their gym's location, catch up.
 *
 * @returns {Promise<number>} How many competitions changed.
 */
export async function syncCompetitionLocations() {
  const gyms = await Gym.find({}, "location").lean();
  let changed = 0;
  for (const gym of gyms) {
    const { modifiedCount } = await moveUpcomingCompetitions(gym._id, gym.location);
    changed += modifiedCount;
  }
  return changed;
}

/**
 * Registers a gym (US-004).
 *
 * @param {{ name: string, location: string, status?: "PENDING" | "ACTIVE" | "INACTIVE", coordinates?: { lat: number, lng: number } }} details
 *   Validated gym details. A gym added by an ADMIN is ACTIVE unless a status is given, and
 *   coordinates is its optional map pin.
 * @param {{ gymId?: import("mongoose").Types.ObjectId }} [options] The ID to save the gym with,
 *   when the caller recorded it elsewhere first. Without it, MongoDB makes one.
 * @returns {Promise<object>} The saved gym, with its pin as coordinates.
 * @throws {AppError} 409 GYM_EXISTS when a gym with the same name and location is registered.
 */
export async function createGym({ name, location, status = "ACTIVE", coordinates }, { gymId } = {}) {
  const existing = await Gym.findOne({ name, location })
    .collation(CASE_INSENSITIVE)
    .lean();
  if (existing) throw gymExists();

  try {
    const gym = await Gym.create({
      ...(gymId ? { _id: gymId } : {}),
      name,
      location,
      status,
      ...(coordinates ? { mapPoint: toGeoPoint(coordinates) } : {}),
    });
    return presentGym(gym.toObject());
  } catch (error) {
    // Two saves of the same gym at once: the unique index stops the second.
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

  return { gyms: gyms.map(presentGym), total, page, limit };
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

  return presentGym(gym);
}

/**
 * Updates the editable details of one gym (US-005), leaving its status and assigned
 * administrators unchanged. Whenever a location is sent, the gym's competitions from today on
 * get it too, even when it hasn't changed, so trying a save again also brings them up to date.
 *
 * @param {string} gymId The gym's ID.
 * @param {{ name?: string, location?: string, coordinates?: { lat: number, lng: number } | null }} details
 *   Validated fields to update. coordinates null removes the map pin.
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
    // This exclusion uses a database ID, not a query operator from user input.
    // Keep sanitizeFilter enabled and trust only this server-built condition.
    _id: mongoose.trusted({ $ne: current._id }),
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
        gymUpdate(details),
        { returnDocument: "after", runValidators: true },
      ),
    );
    if (!gym) throw gymNotFound();
    if (details.location !== undefined) {
      await moveUpcomingCompetitions(gym._id, gym.location);
    }
    return presentGym(gym);
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
      { returnDocument: "after", runValidators: true },
    ),
  );
  if (!gym) throw gymNotFound();

  return presentGym(gym);
}

/**
 * Activates one gym (US-005): a PENDING gym that's ready, or an INACTIVE one coming back. Its
 * records and administrator assignments are unchanged, and its Gym Administrators can manage its
 * competitions again on their next request. An ACTIVE gym is returned as it is.
 *
 * @param {string} gymId The gym's ID.
 * @returns {Promise<object>} The active gym, including assigned administrators.
 * @throws {AppError} 400 INVALID_GYM_ID or 404 GYM_NOT_FOUND.
 */
export async function activateGym(gymId) {
  validateGymId(gymId);

  const gym = await populatedGym(
    Gym.findByIdAndUpdate(
      gymId,
      { $set: { status: "ACTIVE" } },
      { returnDocument: "after", runValidators: true },
    ),
  );
  if (!gym) throw gymNotFound();

  return presentGym(gym);
}
