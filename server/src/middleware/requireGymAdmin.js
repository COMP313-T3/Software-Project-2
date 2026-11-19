import { ROLES } from "../constants/roles.js";
import { Gym } from "../models/Gym.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

const ACTIVE = "ACTIVE";

/**
 * Lets a request through only when the logged-in user's account is still an active Gym
 * Administrator (US-007 criterion 6) and administers at least one ACTIVE gym, and
 * puts those gyms in res.locals.gyms ({ _id, name, location }) and their IDs in
 * res.locals.gymIds. Run it after requireAuth and requireRole(ROLES.GYM_ADMIN).
 *
 * It reads Gym.adminIds from the database on every request, never from the access token or the
 * request, so removing someone as a gym's admin (US-007) or deactivating the gym (US-005) takes
 * effect on their very next request. Every GYM_ADMIN query must then be limited to
 * res.locals.gymIds, which keeps other gyms' competitions out of reach (US-011 criterion 5).
 *
 * The account is read from the database too, so a deactivated account is turned away even with
 * an access token issued before it was deactivated. (Deactivating also ends its sessions, which
 * stops it at requireAuth; this is the second check.)
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 * @param {import("express").NextFunction} next Next middleware.
 * @throws {AppError} 403 ACCOUNT_INACTIVE when the account was deactivated, or 403 NO_ASSIGNED_GYM
 *   when the user isn't an admin of any active gym.
 */
export async function requireGymAdmin(req, res, next) {
  const [account, gyms] = await Promise.all([
    User.exists({ _id: req.auth.userId, role: ROLES.GYM_ADMIN, isActive: true }),
    Gym.find({ adminIds: req.auth.userId, status: ACTIVE }, "name location")
      .sort({ name: 1 })
      .lean(),
  ]);

  if (!account) {
    throw new AppError(
      403,
      "ACCOUNT_INACTIVE",
      "Your Gym Administrator account is deactivated. Contact a System Administrator.",
    );
  }

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
