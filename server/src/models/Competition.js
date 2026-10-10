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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// The Gym Admin Dashboard always asks for one gym's competitions in date order.
competitionSchema.index({ gymId: 1, date: 1 });

/**
 * A bouldering competition run by one gym (FR-004). date is a calendar date stored at midnight
 * UTC, as parseCalendarDate in utils/calendarDates.js makes it, so compare it with
 * parseCalendarDate(torontoToday()).date, never with new Date().
 */
export const Competition = mongoose.model("Competition", competitionSchema);
