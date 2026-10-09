import { Gym } from "../models/Gym.js";
import { AppError } from "../utils/AppError.js";

// Switch to GYM_STATUS.ACTIVE once constants/gyms.js has the frozen-object form.
const ACTIVE = "ACTIVE";

/**
 * Lets a request through only when the logged-in user administers at least one ACTIVE gym, and
 * puts those gyms in res.locals.gyms ({ _id, name, location }) and their IDs in
 * res.locals.gymIds. Run it after requireAuth and requireRole(ROLES.GYM_ADMIN).
 *
 * It reads Gym.adminIds from the database on every request, never from the access token or the
 * request, so removing someone as a gym's admin (US-006) or deactivating the gym (US-005) takes
 * effect on their very next request. Every GYM_ADMIN query must then be limited to
 * res.locals.gymIds, which keeps other gyms' competitions out of reach (US-011 criterion 5).
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Next middleware.
 * @throws {AppError} 403 NO_ASSIGNED_GYM when the user isn't an admin of any active gym.
 */
export async function requireGymAdmin(req, res, next) {
  const gyms = await Gym.find(
    { adminIds: req.auth.userId, status: ACTIVE },
    "name location",
  )
    .sort({ name: 1 })
    .lean();

  if (gyms.length === 0) {
    throw new AppError(
      403,
      "NO_ASSIGNED_GYM",
      "Your account isn't assigned to an active gym yet. Contact a System Administrator.",
    );
  }

  res.locals.gyms = gyms;
  res.locals.gymIds = gyms.map((gym) => gym._id);
  next();
}
