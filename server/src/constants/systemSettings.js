import { DEFAULT_LOGIN_LIMITS } from "../config/env.js";

export const SYSTEM_SETTINGS_ID = "topsend";
export const DEFAULT_PLATFORM_NAME = "TopSend";
export const PLATFORM_NAME_MAX_LENGTH = 100;
export const DEFAULT_CLIMBER_REGISTRATION_ENABLED = true;

/** Failed logins in a row that lock an email, and how long the lock lasts, as an Admin may set them. */
export const FAILED_LOGINS_BEFORE_LOCK_RANGE = Object.freeze({ min: 3, max: 20 });
export const LOGIN_LOCK_MINUTES_RANGE = Object.freeze({ min: 5, max: 120 });

export const MAINTENANCE_MESSAGE_MAX_LENGTH = 200;

/** What anyone kept out by maintenance mode sees when the Admin left the maintenance message empty. */
export const DEFAULT_MAINTENANCE_MESSAGE = "TopSend is down for maintenance. Please try again later.";

export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({
  platformName: DEFAULT_PLATFORM_NAME,
  climberRegistrationEnabled: DEFAULT_CLIMBER_REGISTRATION_ENABLED,
  accessRequestEmails: false,
  failedLoginsBeforeLock: DEFAULT_LOGIN_LIMITS.failuresBeforeLock,
  loginLockMinutes: DEFAULT_LOGIN_LIMITS.lockMinutes,
  maintenanceMode: false,
  maintenanceMessage: "",
});
