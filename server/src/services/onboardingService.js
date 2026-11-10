import { User } from "../models/User.js";
import { sessionExpired } from "./sessionService.js";

/**
 * The first-time onboarding tutorial (US-037). The account remembers when its user first finished
 * or skipped it, so it opens by itself once per account, not once per device.
 */

function present(user) {
  const seenAt = user.onboardingSeenAt ?? null;
  return { seen: seenAt !== null, seenAt: seenAt === null ? null : new Date(seenAt).toISOString() };
}

/**
 * Whether the logged-in user has seen the onboarding tutorial.
 *
 * @param {string} userId The user, from the access token.
 * @returns {Promise<{ seen: boolean, seenAt: string | null }>}
 * @throws {AppError} 401 SESSION_EXPIRED when the account was deactivated or deleted.
 */
export async function getOnboarding(userId) {
  const user = await User.findOne({ _id: userId, isActive: true }, "onboardingSeenAt").lean();
  if (!user) throw sessionExpired();
  return present(user);
}

/**
 * Records that the logged-in user finished or skipped the onboarding tutorial. Only the first time
 * is kept, so watching it again from Onboarding tips changes nothing.
 *
 * @param {string} userId The user, from the access token.
 * @param {Date} [now] When they finished or skipped it.
 * @returns {Promise<{ seen: boolean, seenAt: string | null }>}
 * @throws {AppError} 401 SESSION_EXPIRED when the account was deactivated or deleted.
 */
export async function markOnboardingSeen(userId, now = new Date()) {
  await User.updateOne({ _id: userId, isActive: true, onboardingSeenAt: null }, { $set: { onboardingSeenAt: now } });
  return getOnboarding(userId);
}
