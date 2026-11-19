import {
  getSystemSettings,
  keptOutByMaintenance,
  maintenanceRefusal,
} from "../services/systemSettingsService.js";

/**
 * Pauses a Visitor's request, such as asking for Gym Administrator access, while maintenance mode
 * is on (US-010).
 *
 * @type {import("express").RequestHandler}
 * @throws {import("../utils/AppError.js").AppError} 503 MAINTENANCE.
 */
export async function refuseDuringMaintenance(req, res, next) {
  const settings = await getSystemSettings();
  if (keptOutByMaintenance(settings)) throw maintenanceRefusal(settings);
  next();
}
