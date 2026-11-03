import { AppError } from "../utils/AppError.js";
import { getSystemSettings } from "../services/systemSettingsService.js";

const REGISTRATION_CLOSED = new AppError(
  403,
  "REGISTRATION_CLOSED",
  "Climber sign-up is currently unavailable.",
);

export async function requireClimberRegistration(req, res, next) {
  const settings = await getSystemSettings();
  if (!settings.climberRegistrationEnabled) throw REGISTRATION_CLOSED;
  next();
}
