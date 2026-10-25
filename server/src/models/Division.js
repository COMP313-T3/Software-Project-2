import mongoose from "mongoose";
import { DIVISION_NAME_MAX_LENGTH } from "../constants/divisions.js";

const divisionSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competition",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: DIVISION_NAME_MAX_LENGTH,
    },
  },
  { timestamps: true },
);

// A competition can't have two divisions with the same name, ignoring case, even when two saves
// arrive at once (FR-005: duplicate division names). The index starts with competitionId, so it
// also serves "this competition's divisions". Queries must use the same collation to use it.
divisionSchema.index(
  { competitionId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

/**
 * A category within one competition, such as Beginner, Open, or Youth (US-014, FR-005). It
 * belongs to exactly one competition, so Climbers can only be placed in divisions of the
 * competition they registered for (Registration.divisionId).
 */
export const Division = mongoose.model("Division", divisionSchema);
