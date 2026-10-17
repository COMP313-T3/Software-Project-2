import mongoose from "mongoose";
import {
  COMPETITION_DESCRIPTION_MAX_LENGTH,
  COMPETITION_LOCATION_MAX_LENGTH,
  COMPETITION_MAX_CAPACITY,
  COMPETITION_NAME_MAX_LENGTH,
  COMPETITION_STATUS,
  COMPETITION_STATUSES,
  REGISTRATION_STATUS,
  REGISTRATION_STATUSES,
} from "../constants/competitions.js";
import { FLASH_BONUS_MAX, SCORING_FORMATS } from "../constants/scoring.js";

/**
 * How a competition's official results become scores and rankings (US-018). There is one for the
 * whole competition, so every division is scored by the same rules (criterion 4). Only a Gym
 * Admin of the competition's gym can set it, through PUT .../scoring; no other request, and no AI
 * feature, can change it (criterion 5).
 */
const scoringSchema = new mongoose.Schema(
  {
    format: { type: String, required: true, enum: SCORING_FORMATS },
    flashBonus: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: FLASH_BONUS_MAX,
      validate: Number.isInteger,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const competitionSchema = new mongoose.Schema(
  {
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: COMPETITION_NAME_MAX_LENGTH,
    },
    date: { type: Date, required: true },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: COMPETITION_LOCATION_MAX_LENGTH,
    },
    description: {
      type: String,
      trim: true,
      maxlength: COMPETITION_DESCRIPTION_MAX_LENGTH,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: COMPETITION_MAX_CAPACITY,
      validate: Number.isInteger,
    },
    registrationStatus: {
      type: String,
      required: true,
      enum: REGISTRATION_STATUSES,
      default: REGISTRATION_STATUS.CLOSED,
    },
    status: {
      type: String,
      required: true,
      enum: COMPETITION_STATUSES,
      default: COMPETITION_STATUS.DRAFT,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Left out until a Gym Admin chooses a format, so "not configured yet" is easy to tell apart.
    scoring: { type: scoringSchema, default: undefined },
  },
  { timestamps: true },
);

// The Gym Admin Dashboard always asks for one gym's competitions in date order.
competitionSchema.index({ gymId: 1, date: 1 });

// One gym can't hold two competitions with the same name on the same day, ignoring case, even
// when two "Save" clicks arrive at once (NR-004). Queries that check for a duplicate must use
// this same collation to be answered from the index.
competitionSchema.index(
  { gymId: 1, name: 1, date: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

/**
 * A bouldering competition run by one gym (FR-004), created by one of its Gym Admins (US-012)
 * as a DRAFT with registration CLOSED. date is a calendar date stored at midnight UTC, as
 * parseCalendarDate in utils/calendarDates.js makes it, so compare it with
 * parseCalendarDate(torontoToday()).date, never with new Date(). scoring holds its scoring
 * format once one is chosen (US-018).
 */
export const Competition = mongoose.model("Competition", competitionSchema);
