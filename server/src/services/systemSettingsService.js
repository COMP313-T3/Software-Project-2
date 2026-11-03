import {
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_SETTINGS_ID,
} from "../constants/systemSettings.js";
import { SystemSettings } from "../models/SystemSettings.js";

function publicSettings(settings) {
  return {
    platformName: settings.platformName,
    climberRegistrationEnabled: settings.climberRegistrationEnabled,
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
