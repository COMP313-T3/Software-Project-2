import mongoose from "mongoose";
import {
  DEFAULT_CLIMBER_REGISTRATION_ENABLED,
  DEFAULT_PLATFORM_NAME,
  PLATFORM_NAME_MAX_LENGTH,
  SYSTEM_SETTINGS_ID,
} from "../constants/systemSettings.js";

const systemSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SYSTEM_SETTINGS_ID },
    platformName: {
      type: String,
      required: true,
      trim: true,
      maxlength: PLATFORM_NAME_MAX_LENGTH,
      default: DEFAULT_PLATFORM_NAME,
    },
    climberRegistrationEnabled: {
      type: Boolean,
      required: true,
      default: DEFAULT_CLIMBER_REGISTRATION_ENABLED,
    },
  },
  { timestamps: true },
);

/** Singleton platform settings, persisted separately from environment-managed secrets. */
export const SystemSettings = mongoose.model(
  "SystemSettings",
  systemSettingsSchema,
);
