import mongoose from "mongoose";
import {
  ROUTE_GRADE_PATTERN,
  ROUTE_MAX_POINTS,
  ROUTE_NAME_MAX_LENGTH,
  ROUTE_NOTES_MAX_LENGTH,
  ROUTE_NUMBER_MAX_LENGTH,
} from "../constants/routes.js";

const routeSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competition",
      required: true,
    },
    routeNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: ROUTE_NUMBER_MAX_LENGTH,
    },
    name: {
      type: String,
      trim: true,
      maxlength: ROUTE_NAME_MAX_LENGTH,
    },
    grade: {
      type: String,
      required: true,
      trim: true,
      match: ROUTE_GRADE_PATTERN,
    },
    pointValue: {
      type: Number,
      min: 0,
      max: ROUTE_MAX_POINTS,
      validate: Number.isInteger,
    },
    notes: { type: String, trim: true, maxlength: ROUTE_NOTES_MAX_LENGTH },
    official: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

routeSchema.index(
  { competitionId: 1, routeNumber: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

/**
 * An official boulder problem belonging to one competition (US-016, FR-006). Its number
 * identifies it; a name is optional.
 */
export const Route = mongoose.model("Route", routeSchema);
