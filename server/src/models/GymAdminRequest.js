import mongoose from "mongoose";

const gymAdminRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gym",
    },
    requestType: {
      type: String,
      required: true,
      enum: ["NEW_GYM", "EXISTING_GYM"],
    },
    details: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    submittedAt: { type: Date, required: true, default: Date.now },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

gymAdminRequestSchema.index({ status: 1, requestType: 1 });

/**
 * A request for access to administer a new or existing gym.
 */
export const GymAdminRequest = mongoose.model(
  "GymAdminRequest",
  gymAdminRequestSchema,
);
