import mongoose from "mongoose";
import {
  DEFAULT_CLIMBER_REGISTRATION_ENABLED,
  DEFAULT_PLATFORM_NAME,
  DEFAULT_SYSTEM_SETTINGS,
  FAILED_LOGINS_BEFORE_LOCK_RANGE,
  LOGIN_LOCK_MINUTES_RANGE,
  MAINTENANCE_MESSAGE_MAX_LENGTH,
  PLATFORM_NAME_MAX_LENGTH,
  SYSTEM_SETTINGS_ID,
} from "../constants/systemSettings.js";

const wholeNumber = {
  validator: Number.isInteger,
  message: "Use a whole number.",
};

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
    accessRequestEmails: {
      type: Boolean,
      required: true,
      default: DEFAULT_SYSTEM_SETTINGS.accessRequestEmails,
    },
    failedLoginsBeforeLock: {
      type: Number,
      required: true,
      min: FAILED_LOGINS_BEFORE_LOCK_RANGE.min,
      max: FAILED_LOGINS_BEFORE_LOCK_RANGE.max,
      validate: wholeNumber,
      default: DEFAULT_SYSTEM_SETTINGS.failedLoginsBeforeLock,
    },
    loginLockMinutes: {
      type: Number,
      required: true,
      min: LOGIN_LOCK_MINUTES_RANGE.min,
      max: LOGIN_LOCK_MINUTES_RANGE.max,
      validate: wholeNumber,
      default: DEFAULT_SYSTEM_SETTINGS.loginLockMinutes,
    },
    maintenanceMode: {
      type: Boolean,
      required: true,
      default: DEFAULT_SYSTEM_SETTINGS.maintenanceMode,
    },
    maintenanceMessage: {
      type: String,
      trim: true,
      maxlength: MAINTENANCE_MESSAGE_MAX_LENGTH,
      default: DEFAULT_SYSTEM_SETTINGS.maintenanceMessage,
    },
  },
  { timestamps: true },
);

/** Singleton platform settings, persisted separately from environment-managed secrets. */
export const SystemSettings = mongoose.model(
  "SystemSettings",
  systemSettingsSchema,
);
