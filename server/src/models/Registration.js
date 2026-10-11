import mongoose from "mongoose";
import { REGISTRATION_RECORD_STATUSES } from "../constants/competitions.js";

const registrationSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competition",
      required: true,
    },
    climberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    divisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Division",
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: REGISTRATION_RECORD_STATUSES,
    },
    registeredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

registrationSchema.index({ competitionId: 1, status: 1 });
registrationSchema.index({ competitionId: 1, climberId: 1 }, { unique: true });

/** A Climber's registration record for one competition, as defined by the domain contract. */
export const Registration = mongoose.model("Registration", registrationSchema);
