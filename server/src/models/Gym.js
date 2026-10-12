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

// One gym per name and location, ignoring case, even when two saves arrive at once. Queries that
// check for a duplicate must use this same collation to be answered from the index.
gymSchema.index(
  { name: 1, location: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

/**
 * A registered climbing gym, its TopSend status, and assigned gym administrators.
 */
export const Gym = mongoose.model("Gym", gymSchema);
