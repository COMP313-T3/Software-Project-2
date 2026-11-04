import mongoose from "mongoose";
import { RESULT_SOURCES } from "../constants/results.js";
import { ROUTE_MAX_POINTS } from "../constants/routes.js";
import { SCORING_ATTEMPTS_MAX, SCORING_DEDUCTION_MAX } from "../constants/scoring.js";

/**
 * The rules the score was calculated with: the problem's point value and the competition's
 * scoring settings at that moment. Kept with the result so a score can always be explained, and
 * replaced whenever the score is calculated again.
 */
const scoredWithSchema = new mongoose.Schema(
  {
    pointValue: { type: Number, required: true, min: 0, max: ROUTE_MAX_POINTS },
    deductionPercent: { type: Number, required: true, min: 0, max: SCORING_DEDUCTION_MAX },
    maxAttempts: { type: Number, required: true, min: 1, max: SCORING_ATTEMPTS_MAX },
  },
  { _id: false },
);

const officialResultSchema = new mongoose.Schema(
  {
    competitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competition",
      required: true,
      immutable: true,
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
      immutable: true,
    },
    climberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    // Attempts on the problem, up to and including the top when there is one.
    attempts: {
      type: Number,
      required: true,
      min: 0,
      max: SCORING_ATTEMPTS_MAX,
      validate: Number.isInteger,
    },
    // 1 when the Climber topped the problem, 0 when they didn't (domain contract: sends).
    sends: { type: Number, required: true, enum: [0, 1] },
    // A send on the first attempt.
    flash: { type: Boolean, required: true },
    // Calculated by TopSend from the rules in scoredWith (utils/officialScoring.js), never sent by
    // a client.
    officialScore: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    scoredWith: { type: scoredWithSchema, required: true },
    // Only Gym Administrators record official results; AI features can't (US-019 criterion 7).
    source: { type: String, required: true, enum: RESULT_SOURCES, immutable: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Goes up by one on every change. A save only lands on the version it read, so two judges
    // saving at once never overwrite each other's attempt (NR-004).
    version: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);
