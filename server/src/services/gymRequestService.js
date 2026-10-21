import mongoose from "mongoose";
import {
  GYM_LOOKUP_MAX_RESULTS,
  GYM_REQUEST_STATUS,
  GYM_REQUEST_TYPE,
} from "../constants/gymRequests.js";
import { Gym } from "../models/Gym.js";
import { GymAdminRequest } from "../models/GymAdminRequest.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/** Only ACTIVE gyms can be chosen; pending or deactivated ones aren't offered to Visitors. */
const ACTIVE_GYM = "ACTIVE";

/** Compares text ignoring case; the same collation as the Gym model's unique index. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** MongoDB's error code when a unique index rejects a duplicate. */
const DUPLICATE_KEY = 11000;

const CHECK_THE_FIELDS = "Check the fields and try again.";

/** What the applicant is told happens next (US-034 criteria 5, 6, and 7). */
const NEXT_STEPS =
  "A System Administrator will review your request. You don't have Gym Administrator access yet. " +
  "If your request is approved, we'll email you instructions to set up your Gym Administrator account.";

function requestPending() {
  const message =
    "A request from this email is already waiting for review. We'll email you once it's reviewed.";
  return new AppError(409, "REQUEST_PENDING", message, { email: message });
}

function emailHasAccount() {
  const message =
    "This email already has a TopSend account. Use a different email for your Gym Administrator account.";
  return new AppError(409, "EMAIL_TAKEN", message, { email: message });
}

function gymAlreadyRegistered() {
  const message =
    'This gym is already on TopSend. Choose "Existing gym" to request access to it instead.';
  return new AppError(409, "GYM_EXISTS", message, { gymName: message });
}

function gymNotListed() {
  // The same answer for a gym that doesn't exist and one that isn't ACTIVE, so the form reveals
  // nothing about gyms that aren't open to requests.
  return new AppError(400, "VALIDATION_ERROR", CHECK_THE_FIELDS, {
    gymId: "Choose your gym from the list.",
  });
}

/** Escapes text so it's searched for literally, never run as a regular expression. */
function literal(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The registered gyms a Visitor can ask to administer (US-034 criterion 2): ACTIVE gyms whose name
 * or address contains the search text, ignoring case, by name. Only the name and address are
 * shown; administrators and status stay private.
 *
 * @param {{ q?: string }} query The validated query.
 * @returns {Promise<{ gyms: { _id: unknown, name: string, location: string }[] }>}
 */
export async function listRegisteredGyms({ q } = {}) {
  const filter = { status: ACTIVE_GYM };
  if (q) {
    // Built by the server, with the text escaped, so these operators are trusted past
    // sanitizeFilter.
    const text = () => mongoose.trusted({ $regex: literal(q), $options: "i" });
    filter.$or = [{ name: text() }, { location: text() }];
  }
  const gyms = await Gym.find(filter, "name location")
    .collation(CASE_INSENSITIVE)
    .sort({ name: 1 })
    .limit(GYM_LOOKUP_MAX_RESULTS)
    .lean();
  return { gyms: gyms.map(({ _id, name, location }) => ({ _id, name, location })) };
}

/**
 * Saves a Visitor's gym registration or Gym Administrator access request (US-034) as PENDING, for
 * a System Administrator to review (US-035).
 *
 * Saving it grants nothing (criterion 5): no account is created, no role is given, no gym is
 * created or approved, and no one is added to a gym's administrators. The status is always set
 * here, never taken from the request.
 *
 * It's refused when:
 * - the email already has a TopSend account, since the approved applicant sets up a new
 *   GYM_ADMIN account with it (409 EMAIL_TAKEN);
 * - the email already has a request waiting for review (409 REQUEST_PENDING);
 * - an EXISTING_GYM request names a gym that isn't an ACTIVE registered gym (400);
 * - a NEW_GYM request names a gym already registered at that address, ignoring case
 *   (409 GYM_EXISTS).
 *
 * @param {{ requestType: string, contact: { firstName: string, lastName: string, email: string, phone: string, jobTitle?: string }, proposedGym?: { name: string, location: string }, gymId?: string, details?: string }} request
 *   The validated body from gymRequestSchema.
 * @returns {Promise<object>} The saved request's confirmation (criterion 6).
 * @throws {AppError} See above.
 */
export async function submitGymRequest({ requestType, contact, proposedGym, gymId, details }) {
  const [hasAccount, pending] = await Promise.all([
    User.exists({ email: contact.email }),
    GymAdminRequest.exists({
      "contact.email": contact.email,
      status: GYM_REQUEST_STATUS.PENDING,
    }),
  ]);
  if (hasAccount) throw emailHasAccount();
  if (pending) throw requestPending();

  let gym = null;
  if (requestType === GYM_REQUEST_TYPE.EXISTING_GYM) {
    gym = await Gym.findOne({ _id: gymId, status: ACTIVE_GYM }, "name location").lean();
    if (!gym) throw gymNotListed();
  } else {
    const registered = await Gym.exists({
      name: proposedGym.name,
      location: proposedGym.location,
    }).collation(CASE_INSENSITIVE);
    if (registered) throw gymAlreadyRegistered();
  }

  let saved;
  try {
    saved = await GymAdminRequest.create({
      requestType,
      contact,
      ...(gym ? { gymId: gym._id } : { proposedGym }),
      details,
      status: GYM_REQUEST_STATUS.PENDING,
      submittedAt: new Date(),
    });
  } catch (error) {
    // Two submissions from the same email at once: the unique index stops the second.
    if (error?.code === DUPLICATE_KEY) throw requestPending();
    throw error;
  }

  // No email or name in the log: the applicant isn't a TopSend user yet.
  logger.info("Gym request submitted", {
    requestId: saved.id,
    requestType,
    ...(gym ? { gymId: String(gym._id) } : {}),
  });

  return {
    requestId: saved.id,
    requestType: saved.requestType,
    status: saved.status,
    submittedAt: saved.submittedAt,
    contact: {
      firstName: saved.contact.firstName,
      lastName: saved.contact.lastName,
      email: saved.contact.email,
    },
    gym: gym
      ? { _id: gym._id, name: gym.name, location: gym.location }
      : { name: saved.proposedGym.name, location: saved.proposedGym.location },
    message: "Your request was submitted for review.",
    nextSteps: NEXT_STEPS,
  };
}
