import { ROLES } from "../constants/roles.js";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_SETTINGS_ID,
} from "../constants/systemSettings.js";
import { SystemSettings } from "../models/SystemSettings.js";
import { AppError } from "../utils/AppError.js";

function publicSettings(settings) {
  const value = (field) => settings[field] ?? DEFAULT_SYSTEM_SETTINGS[field];
  return {
    platformName: value("platformName"),
    climberRegistrationEnabled: value("climberRegistrationEnabled"),
    accessRequestEmails: value("accessRequestEmails"),
    failedLoginsBeforeLock: value("failedLoginsBeforeLock"),
    loginLockMinutes: value("loginLockMinutes"),
    maintenanceMode: value("maintenanceMode"),
    maintenanceMessage: value("maintenanceMessage"),
  };
}

/** Loads saved settings, using documented defaults until an Admin saves a setting. */
export async function getSystemSettings() {
  const settings = await SystemSettings.findById(SYSTEM_SETTINGS_ID);
  return settings ? publicSettings(settings) : { ...DEFAULT_SYSTEM_SETTINGS };
}

/** Updates only submitted fields so settings the Admin left untouched are preserved. */
export async function updateSystemSettings(changes) {
  const settings = await SystemSettings.findOneAndUpdate(
    { _id: SYSTEM_SETTINGS_ID },
    { $set: changes },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );
  return publicSettings(settings);
}

/**
 * What every logged-in page shows at its top: the maintenance message, and whether maintenance
 * mode is on.
 *
 * @returns {Promise<{ maintenanceMode: boolean, maintenanceMessage: string }>}
 */
export async function getMaintenanceNotice() {
  const { maintenanceMode, maintenanceMessage } = await getSystemSettings();
  return { maintenanceMode, maintenanceMessage };
}

/**
 * The refusal while maintenance mode is on, with the Admin's maintenance message, or a plain one
 * when it's empty.
 *
 * @param {{ maintenanceMessage: string }} settings The settings.
 * @returns {AppError} 503 MAINTENANCE.
 */
export function maintenanceRefusal(settings) {
  return new AppError(503, "MAINTENANCE", settings.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE);
}

/**
 * Whether maintenance mode keeps someone out: everyone but a System Administrator, including a
 * Visitor, who has no role.
 *
 * @param {{ maintenanceMode: boolean }} settings The settings.
 * @param {string} [role] The account's role.
 * @returns {boolean}
 */
export function keptOutByMaintenance(settings, role) {
  return settings.maintenanceMode && role !== ROLES.ADMIN;
}
