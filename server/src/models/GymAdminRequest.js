import mongoose from "mongoose";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
} from "../constants/accountLimits.js";
import { GYM_LOCATION_MAX_LENGTH, GYM_NAME_MAX_LENGTH } from "../constants/gyms.js";
import {
  GYM_REQUEST_DETAILS_MAX_LENGTH,
  GYM_REQUEST_JOB_TITLE_MAX_LENGTH,
  GYM_REQUEST_STATUS,
  GYM_REQUEST_STATUSES,
  GYM_REQUEST_TYPE,
  GYM_REQUEST_TYPES,
} from "../constants/gymRequests.js";

/** Who sent the request. They have no TopSend account yet, so this is how the Admin reaches them. */
const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    lastName: { type: String, required: true, trim: true, maxlength: NAME_MAX_LENGTH },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
    },
    phone: { type: String, required: true, trim: true, maxlength: PHONE_MAX_LENGTH },
    jobTitle: { type: String, trim: true, maxlength: GYM_REQUEST_JOB_TITLE_MAX_LENGTH },
  },
  { _id: false },
);

/**
 * The gym a NEW_GYM request asks to register. It's only a proposal: no Gym record exists until a
 * System Administrator approves the request (US-035, US-004 criterion 5).
 */
const proposedGymSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: GYM_NAME_MAX_LENGTH },
    location: { type: String, required: true, trim: true, maxlength: GYM_LOCATION_MAX_LENGTH },
  },
  { _id: false },
);

function isNewGym() {
  return this.requestType === GYM_REQUEST_TYPE.NEW_GYM;
}

function isExistingGym() {
  return this.requestType === GYM_REQUEST_TYPE.EXISTING_GYM;
}

const gymAdminRequestSchema = new mongoose.Schema(
  {
    // The applicant's GYM_ADMIN account. A Visitor has none when they submit, so it's set only
    // when an approved applicant completes their account setup (US-035).
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // The registered gym an EXISTING_GYM request asks to administer. For NEW_GYM, it's set to the
    // gym created on approval (US-004 criterion 5).
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gym",
      required: isExistingGym,
    },
    requestType: {
      type: String,
      required: true,
      enum: GYM_REQUEST_TYPES,
    },
    contact: { type: contactSchema, required: true },
    proposedGym: { type: proposedGymSchema, required: isNewGym },
    // Anything else the applicant wants the reviewer to know, such as how to verify their role.
    details: { type: String, trim: true, maxlength: GYM_REQUEST_DETAILS_MAX_LENGTH },
    status: {
      type: String,
      required: true,
      enum: GYM_REQUEST_STATUSES,
      default: GYM_REQUEST_STATUS.PENDING,
    },
    submittedAt: { type: Date, required: true, default: Date.now },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

// The Admin Dashboard counts and the review list (US-003, US-035).
gymAdminRequestSchema.index({ status: 1, requestType: 1 });

// The requests for one gym, such as an Admin checking who asked for access to it.
gymAdminRequestSchema.index({ gymId: 1, status: 1 });

// One email can have only one request waiting for review at a time, even when the form is sent
// twice at once (NR-004). Requests saved before contact details existed aren't covered.
gymAdminRequestSchema.index(
  { "contact.email": 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: GYM_REQUEST_STATUS.PENDING,
      "contact.email": { $exists: true },
    },
  },
);

/**
 * A Visitor's request to register a new gym or to administer one already on TopSend (US-034,
 * FR-002). It starts PENDING and grants nothing by itself: no account, role, gym, or gym
 * assignment is created until a System Administrator approves it (US-035).
 */
export const GymAdminRequest = mongoose.model(
  "GymAdminRequest",
  gymAdminRequestSchema,
);
