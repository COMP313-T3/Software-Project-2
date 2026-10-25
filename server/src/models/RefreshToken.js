import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, select: false },
    previousTokenHashes: { type: [String], default: [], select: false },
    rotatedAt: { type: Date },
    lastActiveAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * One login session on one device. Its ID and a random secret make up the refresh cookie. Only
 * SHA-256 hashes are stored: of the current secret, and of the last few it replaced, which tell
 * a stolen old cookie apart from a made-up one. The secret changes on every refresh. expiresAt is
 * the earlier of the idle limit (from lastActiveAt) and absoluteExpiresAt, and MongoDB deletes
 * each session shortly after it.
 */
export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
