import { z } from "zod";
import { PLATFORM_NAME_MAX_LENGTH } from "../constants/systemSettings.js";

const platformName = z
  .string({ error: "Enter a platform name." })
  .trim()
  .min(1, { error: "Enter a platform name." })
  .max(PLATFORM_NAME_MAX_LENGTH, {
    error: `Use ${PLATFORM_NAME_MAX_LENGTH} characters or fewer.`,
  })
  .optional();

export const updateSystemSettingsSchema = z
  .object({
    platformName,
    climberRegistrationEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((settings) => Object.keys(settings).length > 0, {
    error: "Change at least one system setting.",
  });
