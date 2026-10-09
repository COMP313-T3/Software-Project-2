import mongoose from "mongoose";

const gymSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "ACTIVE", "INACTIVE"],
    },
    adminIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

gymSchema.index({ status: 1 });
gymSchema.index({ adminIds: 1 });

/**
 * A registered climbing gym, its TopSend status, and assigned gym administrators.
 */
export const Gym = mongoose.model("Gym", gymSchema);
