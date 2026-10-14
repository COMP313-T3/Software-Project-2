import mongoose from "mongoose";

const routeSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competition",
      required: true,
    },
    routeNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    grade: { type: String, required: true, trim: true },
    pointValue: { type: Number },
    notes: { type: String, trim: true },
    official: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

routeSchema.index(
  { competitionId: 1, routeNumber: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

/**
 * An official boulder problem belonging to one competition (US-016, FR-006).
 */
export const Route = mongoose.model("Route", routeSchema);
