import mongoose from "mongoose";
import {
  GYM_REQUEST_DECISION,
  GYM_REQUEST_LIST_ALL,
  GYM_REQUEST_STATUS,
  GYM_REQUEST_TYPE,
} from "../constants/gymRequests.js";
import { DEFAULT_PAGE_SIZE } from "../constants/pagination.js";
import { gymAdminApprovedEmail, gymRequestRejectedEmail } from "../emails/gymRequestEmails.js";
import { Gym } from "../models/Gym.js";
import { GymAdminRequest } from "../models/GymAdminRequest.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { newSetupLink } from "./gymAdminSetupService.js";
import { createGym } from "./gymService.js";

/** A gym registered by approving a NEW_GYM request is open right away (US-004 criterion 5). */
const ACTIVE_GYM = "ACTIVE";

/** Compares text ignoring case; the same collation as the Gym model's unique index. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

const STATUS_WORDS = {
  [GYM_REQUEST_STATUS.APPROVED]: "approved",
  [GYM_REQUEST_STATUS.REJECTED]: "rejected",
};

function requestNotFound() {
  return new AppError(404, "GYM_REQUEST_NOT_FOUND", "Gym request not found.");
}

/** A request can be reviewed once (task: prevent duplicate approval or rejection). */
function alreadyReviewed(status) {
  const word = STATUS_WORDS[status] ?? "reviewed";
  return new AppError(
    409,
    "GYM_REQUEST_ALREADY_REVIEWED",
    `This request was already ${word}. Only pending requests can be approved or rejected.`,
  );
}

function emailNowHasAccount() {
  return new AppError(
    409,
    "EMAIL_TAKEN",
    "The applicant's email now has a TopSend account, so a Gym Administrator account can't be " +
      "set up with it. Reject this request and ask the applicant to apply with another email.",
  );
}

function gymNowRegistered() {
  return new AppError(
    409,
    "GYM_EXISTS",
    "A gym with this name and address is already on TopSend. Reject this request and ask the " +
      "applicant to request access to the registered gym instead.",
  );
}

function requestedGymMissing() {
  return new AppError(
    409,
    "GYM_NOT_FOUND",
    "The gym in this request is no longer registered on TopSend. Reject this request instead.",
  );
}

function setupLinkUnavailable(request) {
  if (request.status !== GYM_REQUEST_STATUS.APPROVED) {
    return new AppError(
      409,
      "GYM_REQUEST_NOT_APPROVED",
      "Only approved requests have an account setup link.",
    );
  }
  return new AppError(
    409,
    "SETUP_ALREADY_COMPLETED",
    "The applicant already set up their Gym Administrator account.",
  );
}

function pickGym(gym) {
  return gym ? { _id: gym._id, name: gym.name, location: gym.location, status: gym.status } : null;
}

/** The gym a request is about: the registered gym once there is one, else the proposed one. */
function requestGym(request, gym) {
  if (gym) return pickGym(gym);
  if (request.proposedGym) {
    return { _id: null, name: request.proposedGym.name, location: request.proposedGym.location, status: null };
  }
  return null;
}

/** One row of the review list. */
function presentSummary(request, gym) {
  return {
    _id: request._id,
    requestType: request.requestType,
    status: request.status,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt ?? null,
    contact: {
      firstName: request.contact?.firstName,
      lastName: request.contact?.lastName,
      email: request.contact?.email,
    },
    gym: requestGym(request, gym),
  };
}

/**
 * Everything the Admin needs to decide (US-035 criterion 2): the contact details, the gym, the
 * applicant's notes, the review, and, once approved, how account setup is going.
 */
async function presentDetails(request) {
  const [gym, reviewer] = await Promise.all([
    request.gymId ? Gym.findById(request.gymId, "name location status").lean() : null,
    request.reviewedBy
      ? User.findById(request.reviewedBy, "firstName lastName email").lean()
      : null,
  ]);

  let checks = null;
  if (request.status === GYM_REQUEST_STATUS.PENDING) {
    // Things that would stop an approval, shown before the Admin decides.
    const [emailHasAccount, gymAlreadyRegistered] = await Promise.all([
      User.exists({ email: request.contact?.email }),
      request.requestType === GYM_REQUEST_TYPE.NEW_GYM && request.proposedGym
        ? Gym.exists({
            name: request.proposedGym.name,
            location: request.proposedGym.location,
          }).collation(CASE_INSENSITIVE)
        : null,
    ]);
    checks = {
      emailHasAccount: Boolean(emailHasAccount),
      ...(request.requestType === GYM_REQUEST_TYPE.NEW_GYM
        ? { gymAlreadyRegistered: Boolean(gymAlreadyRegistered) }
        : { gymRegistered: Boolean(gym), gymActive: gym?.status === ACTIVE_GYM }),
    };
  }

  let accountSetup = null;
  if (request.status === GYM_REQUEST_STATUS.APPROVED) {
    const completed = Boolean(request.setupCompletedAt);
    accountSetup = {
      completed,
      completedAt: request.setupCompletedAt ?? null,
      userId: request.userId ?? null,
      linkExpiresAt: completed ? null : (request.setupLinkExpiresAt ?? null),
      linkExpired:
        !completed && (!request.setupLinkExpiresAt || request.setupLinkExpiresAt <= new Date()),
    };
  }

  return {
    _id: request._id,
    requestType: request.requestType,
    status: request.status,
    submittedAt: request.submittedAt,
    contact: {
      firstName: request.contact?.firstName,
      lastName: request.contact?.lastName,
      email: request.contact?.email,
      phone: request.contact?.phone,
      jobTitle: request.contact?.jobTitle ?? null,
    },
    details: request.details ?? null,
    proposedGym: request.proposedGym
      ? { name: request.proposedGym.name, location: request.proposedGym.location }
      : null,
    gym: pickGym(gym),
    checks,
    review:
      request.status === GYM_REQUEST_STATUS.PENDING
        ? null
        : {
            reviewedBy: reviewer
              ? {
                  _id: reviewer._id,
                  firstName: reviewer.firstName,
                  lastName: reviewer.lastName,
                  email: reviewer.email,
                }
              : null,
            reviewedAt: request.reviewedAt ?? null,
            rejectionReason: request.rejectionReason ?? null,
          },
    accountSetup,
  };
}

async function findRequest(requestId) {
  const request = await GymAdminRequest.findById(requestId).lean();
  if (!request) throw requestNotFound();
  return request;
}

/**
 * The review list (US-035 criterion 1): PENDING requests by default, oldest first so none waits
 * too long. Other statuses, and ALL, show the most recently submitted first.
 *
 * @param {{ status?: string, requestType?: string, page?: number, limit?: number }} [query]
 *   The validated query.
 * @returns {Promise<{ requests: object[], total: number, page: number, limit: number }>}
 */
export async function listGymRequests({
  status = GYM_REQUEST_STATUS.PENDING,
  requestType,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
} = {}) {
  const filter = {};
  if (status !== GYM_REQUEST_LIST_ALL) filter.status = status;
  if (requestType) filter.requestType = requestType;
  const oldestFirst = status === GYM_REQUEST_STATUS.PENDING;

  const [requests, total] = await Promise.all([
    GymAdminRequest.find(filter)
      .sort({ submittedAt: oldestFirst ? 1 : -1, _id: oldestFirst ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    GymAdminRequest.countDocuments(filter),
  ]);

  const gymIds = [...new Set(requests.filter((r) => r.gymId).map((r) => String(r.gymId)))];
  const gyms = gymIds.length
    ? await Gym.find(
        // Built by the server from stored IDs, so the operator is trusted past sanitizeFilter.
        { _id: mongoose.trusted({ $in: gymIds }) },
        "name location status",
      ).lean()
    : [];
  const gymsById = new Map(gyms.map((gym) => [String(gym._id), gym]));

  return {
    requests: requests.map((request) =>
      presentSummary(request, request.gymId ? gymsById.get(String(request.gymId)) : null),
    ),
    total,
    page,
    limit,
  };
}

/**
 * One request with everything the Admin needs to review it (US-035 criterion 2).
 *
 * @param {string} requestId The validated request ID.
 * @returns {Promise<object>} The request's details.
 * @throws {AppError} 404 GYM_REQUEST_NOT_FOUND.
 */
export async function getGymRequest(requestId) {
  return presentDetails(await findRequest(requestId));
}

/** Puts a request back to PENDING when its approval couldn't be finished. */
async function undoApproval(request, reviewedAt) {
  await GymAdminRequest.findOneAndUpdate(
    { _id: request._id, status: GYM_REQUEST_STATUS.APPROVED, reviewedAt },
    {
      $set: { status: GYM_REQUEST_STATUS.PENDING },
      $unset: { reviewedBy: 1, reviewedAt: 1, setupTokenHash: 1, setupLinkExpiresAt: 1 },
    },
  );
}

/** Moves a request out of PENDING, unless another review got there first. */
async function claimForReview(request, update) {
  const claimed = await GymAdminRequest.findOneAndUpdate(
    { _id: request._id, status: GYM_REQUEST_STATUS.PENDING },
    { $set: update },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (claimed) return claimed;

  const current = await GymAdminRequest.findById(request._id, "status").lean();
  if (!current) throw requestNotFound();
  throw alreadyReviewed(current.status);
}

async function approve(request, adminId, appUrl) {
  if (await User.exists({ email: request.contact.email })) throw emailNowHasAccount();

  let gym = null;
  if (request.requestType === GYM_REQUEST_TYPE.EXISTING_GYM) {
    // Criterion 5: the applicant is connected to the registered gym they chose. An inactive gym
    // can still be approved; its Gym Administrators can manage it once it's activated (US-005).
    gym = await Gym.findById(request.gymId, "name location status").lean();
    if (!gym) throw requestedGymMissing();
  } else {
    const registered = await Gym.exists({
      name: request.proposedGym.name,
      location: request.proposedGym.location,
    }).collation(CASE_INSENSITIVE);
    if (registered) throw gymNowRegistered();
  }

  const link = newSetupLink(appUrl);
  const reviewedAt = new Date();
  await claimForReview(request, {
    status: GYM_REQUEST_STATUS.APPROVED,
    reviewedBy: adminId,
    reviewedAt,
    setupTokenHash: link.tokenHash,
    setupLinkExpiresAt: link.expiresAt,
  });

  if (request.requestType === GYM_REQUEST_TYPE.NEW_GYM) {
    // Criterion 4: the approved gym is registered, through the same rules as an Admin adding one.
    try {
      gym = await createGym({
        name: request.proposedGym.name,
        location: request.proposedGym.location,
        status: ACTIVE_GYM,
      });
    } catch (error) {
      await undoApproval(request, reviewedAt);
      if (error instanceof AppError && error.code === "GYM_EXISTS") throw gymNowRegistered();
      throw error;
    }
    await GymAdminRequest.updateOne({ _id: request._id }, { $set: { gymId: gym._id } });
  }

  logger.info("Gym request approved", {
    gymRequestId: String(request._id),
    requestType: request.requestType,
    reviewedBy: String(adminId),
    gymId: String(gym._id),
  });

  return {
    gymRequest: await findRequest(request._id),
    email: {
      to: request.contact.email,
      ...gymAdminApprovedEmail({
        firstName: request.contact.firstName,
        gymName: gym.name,
        link: link.href,
        expiresAt: link.expiresAt,
      }),
    },
  };
}

async function reject(request, adminId, reason) {
  // Criterion 7: nothing is granted. No account, gym, or assignment is created, and no setup link
  // exists for a rejected request.
  await claimForReview(request, {
    status: GYM_REQUEST_STATUS.REJECTED,
    reviewedBy: adminId,
    reviewedAt: new Date(),
    ...(reason ? { rejectionReason: reason } : {}),
  });

  logger.info("Gym request rejected", {
    gymRequestId: String(request._id),
    requestType: request.requestType,
    reviewedBy: String(adminId),
  });

  const gymRequest = await findRequest(request._id);
  const gym = request.gymId ? await Gym.findById(request.gymId, "name").lean() : null;
  return {
    gymRequest,
    email: {
      to: request.contact.email,
      ...gymRequestRejectedEmail({
        firstName: request.contact.firstName,
        gymName: gym?.name ?? request.proposedGym?.name ?? "your gym",
        reason,
      }),
    },
  };
}

/**
 * Approves or rejects a PENDING request (US-035 criterion 3) and records who reviewed it and when.
 * Each request is reviewed once: a second review, even one sent at the same moment, gets 409.
 *
 * APPROVE: a NEW_GYM request registers its gym as ACTIVE and remembers its ID (criterion 4); an
 * EXISTING_GYM request keeps the registered gym it chose (criterion 5). Either way a one-time
 * account setup link is made for the applicant (criterion 6). No account is created yet.
 *
 * REJECT: saves the optional reason. Nothing is granted (criterion 7).
 *
 * @param {{ requestId: string, adminId: string, decision: string, reason?: string, appUrl: string }} review
 *   The validated request ID and body, the reviewing ADMIN's ID, and the web app's address for
 *   the setup link.
 * @returns {Promise<{ request: object, email: { to: string, subject: string, text: string, html: string } }>}
 *   The reviewed request's details and the email to send the applicant.
 * @throws {AppError} 404 GYM_REQUEST_NOT_FOUND, 409 GYM_REQUEST_ALREADY_REVIEWED, or for an
 *   approval 409 EMAIL_TAKEN, GYM_EXISTS, or GYM_NOT_FOUND.
 */
export async function reviewGymRequest({ requestId, adminId, decision, reason, appUrl }) {
  const request = await findRequest(requestId);
  if (request.status !== GYM_REQUEST_STATUS.PENDING) throw alreadyReviewed(request.status);

  const { gymRequest, email } =
    decision === GYM_REQUEST_DECISION.APPROVE
      ? await approve(request, adminId, appUrl)
      : await reject(request, adminId, reason);

  return { request: await presentDetails(gymRequest), email };
}

/**
 * Makes a new account setup link for an APPROVED request whose applicant hasn't set up their
 * account yet, such as when the first link expired or email was off. The old link stops working.
 *
 * @param {{ requestId: string, appUrl: string }} options The validated request ID and the web
 *   app's address.
 * @returns {Promise<{ request: object, email: { to: string, subject: string, text: string, html: string } }>}
 * @throws {AppError} 404 GYM_REQUEST_NOT_FOUND, 409 GYM_REQUEST_NOT_APPROVED, or 409
 *   SETUP_ALREADY_COMPLETED.
 */
export async function renewSetupLink({ requestId, appUrl }) {
  const request = await findRequest(requestId);
  if (request.status !== GYM_REQUEST_STATUS.APPROVED || request.setupCompletedAt) {
    throw setupLinkUnavailable(request);
  }

  const link = newSetupLink(appUrl);
  const updated = await GymAdminRequest.findOneAndUpdate(
    {
      _id: request._id,
      status: GYM_REQUEST_STATUS.APPROVED,
      // Server-built condition, trusted past sanitizeFilter.
      setupCompletedAt: mongoose.trusted({ $exists: false }),
    },
    { $set: { setupTokenHash: link.tokenHash, setupLinkExpiresAt: link.expiresAt } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!updated) throw setupLinkUnavailable(await findRequest(requestId));

  const gym = await Gym.findById(updated.gymId, "name").lean();
  logger.info("Gym Admin setup link renewed", { gymRequestId: String(request._id) });

  return {
    request: await presentDetails(updated),
    email: {
      to: updated.contact.email,
      ...gymAdminApprovedEmail({
        firstName: updated.contact.firstName,
        gymName: gym?.name ?? updated.proposedGym?.name ?? "your gym",
        link: link.href,
        expiresAt: link.expiresAt,
      }),
    },
  };
}
