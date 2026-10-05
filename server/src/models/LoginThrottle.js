import mongoose from "mongoose";

const loginThrottleSchema = new mongoose.Schema({
  emailHash: { type: String, required: true, unique: true },
  attempts: { type: Number, required: true, default: 0 },
  windowStartedAt: { type: Date, required: true },
  lockedUntil: { type: Date },
  expiresAt: { type: Date, required: true },
});

loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Login attempts for one email since its last successful login, counted whether or not the email
 * has an account, so a lock never reveals which emails are registered. The email is stored as a
 * SHA-256 hash. MongoDB deletes each one once its counting window or its lock is over.
 */
export const LoginThrottle = mongoose.model(
  "LoginThrottle",
  loginThrottleSchema,
);
