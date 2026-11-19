import { z } from "zod";
import {
  FAILED_LOGINS_BEFORE_LOCK_RANGE,
  LOGIN_LOCK_MINUTES_RANGE,
  MAINTENANCE_MESSAGE_MAX_LENGTH,
  PLATFORM_NAME_MAX_LENGTH,
} from "../constants/systemSettings.js";

const platformName = z
  .string({ error: "Enter a platform name." })
  .trim()
  .min(1, { error: "Enter a platform name." })
  .max(PLATFORM_NAME_MAX_LENGTH, {
    error: `Use ${PLATFORM_NAME_MAX_LENGTH} characters or fewer.`,
  })
  .optional();

function wholeNumberIn({ min, max }) {
  const error = `Enter a whole number from ${min} to ${max}.`;
  return z.number({ error }).int({ error }).min(min, { error }).max(max, { error }).optional();
}

const maintenanceMessage = z
  .string({ error: "Enter the message as text." })
  .trim()
  .max(MAINTENANCE_MESSAGE_MAX_LENGTH, {
    error: `Use ${MAINTENANCE_MESSAGE_MAX_LENGTH} characters or fewer.`,
  })
  .optional();

export const updateSystemSettingsSchema = z
  .object({
    platformName,
    climberRegistrationEnabled: z.boolean().optional(),
    accessRequestEmails: z.boolean().optional(),
    failedLoginsBeforeLock: wholeNumberIn(FAILED_LOGINS_BEFORE_LOCK_RANGE),
    loginLockMinutes: wholeNumberIn(LOGIN_LOCK_MINUTES_RANGE),
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage,
  })
  .strict()
  .refine((settings) => Object.keys(settings).length > 0, {
    error: "Change at least one system setting.",
  });
