import mongoose from "mongoose";
import { pointSchema } from "./pointSchema.js";

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
    // Where the gym is on the map, chosen by an ADMIN. Its competitions are pinned here and
    // distance searches measure from it (US-025, US-027). Left out until it's chosen.
    mapPoint: { type: pointSchema, default: undefined },
  },
  { timestamps: true },
);

gymSchema.index({ status: 1 });
gymSchema.index({ adminIds: 1 });

// Distance searches look for gyms near a point. Gyms without a pin aren't indexed.
gymSchema.index({ mapPoint: "2dsphere" });

// One gym per name and location, ignoring case, even when two saves arrive at once. Queries that
// check for a duplicate must use this same collation to be answered from the index.
gymSchema.index(
  { name: 1, location: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

/**
 * A registered climbing gym, its TopSend status, assigned gym administrators, and its optional
 * map pin, which every one of its competitions uses (mapPoint, [longitude, latitude]).
 */
export const Gym = mongoose.model("Gym", gymSchema);
