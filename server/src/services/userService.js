import { LEGAL_VERSION } from "../constants/legal.js";
import { ROLES } from "../constants/roles.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { hashPassword } from "./passwordService.js";

const DUPLICATE_KEY = 11000;
const EMAIL_TAKEN_MESSAGE =
  "This email already has an account. Try logging in.";

function emailTaken() {
  return new AppError(409, "EMAIL_TAKEN", EMAIL_TAKEN_MESSAGE, {
    email: EMAIL_TAKEN_MESSAGE,
  });
}

/**
 * Creates a climber account. The role is always CLIMBER, whatever the request asked for, and
 * the agreement to the current Terms and Privacy Policy is recorded with its time.
 *
 * @param {object} details Validated sign-up details: firstName, lastName, email (lowercased),
 *   password, dateOfBirth (a Date), gender, phone, address, postalCode, country, and an
 *   optional location ({ lat, lng }).
 * @returns {Promise<InstanceType<typeof User>>} The saved user.
 * @throws {AppError} 409 EMAIL_TAKEN when the email already has an account.
 */
export async function createClimberAccount({
  firstName,
  lastName,
  email,
  password,
  dateOfBirth,
  gender,
  phone,
  address,
  postalCode,
  country,
  location,
}) {
  if (await User.exists({ email })) throw emailTaken();

  const passwordHash = await hashPassword(password);
  try {
    return await User.create({
      firstName,
      lastName,
      email,
      passwordHash,
      role: ROLES.CLIMBER,
      dateOfBirth,
      gender,
      phone,
      address,
      postalCode,
      country,
      location: location
        ? { type: "Point", coordinates: [location.lng, location.lat] }
        : undefined,
      termsAcceptedAt: new Date(),
      termsVersion: LEGAL_VERSION,
    });
  } catch (error) {
    if (error?.code === DUPLICATE_KEY) throw emailTaken();
    throw error;
  }
}
