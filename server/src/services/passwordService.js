import { argon2id, hash, verify } from "argon2";

/**
 * The argon2id minimum from the OWASP Password Storage Cheat Sheet: 19 MiB of memory,
 * 2 passes, and 1 lane. Each hash holds that memory while it runs, so higher settings
 * limit how many sign-ins a small server can handle at once.
 */
const HASH_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

/**
 * Hashes a password with argon2id and a random salt.
 *
 * @param {string} password The plain password.
 * @returns {Promise<string>} The encoded hash, which includes the salt and settings.
 */
export function hashPassword(password) {
  return hash(password, HASH_OPTIONS);
}

/**
 * Checks a password against a stored hash.
 *
 * @param {string} passwordHash Hash made by hashPassword.
 * @param {string} password The plain password to check.
 * @returns {Promise<boolean>} True when the password matches.
 */
export function verifyPassword(passwordHash, password) {
  return verify(passwordHash, password);
}
