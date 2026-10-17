import { z } from "zod";
import {
  FLASH_BONUS_MAX,
  SCORING_FORMAT,
  SCORING_FORMAT_OPTIONS,
  SCORING_FORMATS,
} from "../constants/scoring.js";

const FORMAT_MESSAGE = `Choose a scoring format: ${SCORING_FORMAT_OPTIONS.map(
  (option) => option.label,
).join(" or ")}.`;
const BONUS_MESSAGE = `Enter a flash bonus from 0 to ${FLASH_BONUS_MAX} points.`;

/** A whole number of bonus points. Forms often send numbers as text, so "10" is accepted as 10. */
const flashBonus = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() !== "" ? Number(value) : value,
  z
    .number({ error: BONUS_MESSAGE })
    .int({ error: BONUS_MESSAGE })
    .min(0, { error: BONUS_MESSAGE })
    .max(FLASH_BONUS_MAX, { error: BONUS_MESSAGE }),
);

/**
 * Body of PUT /api/gym-admin/competitions/:competitionId/scoring (US-018). The format must be one
 * TopSend supports (criterion 1). A flash bonus only means something for the Points format, so
 * sending one with Tops and attempts is refused rather than silently ignored. Keys that aren't
 * listed, such as who changed it or when, are dropped; the server records those itself.
 */
export const scoringSettingsSchema = z
  .object({
    format: z.enum(SCORING_FORMATS, { error: FORMAT_MESSAGE }),
    flashBonus: flashBonus.optional(),
  })
  .superRefine((settings, ctx) => {
    if (
      settings.format !== SCORING_FORMAT.POINTS &&
      settings.flashBonus !== undefined &&
      settings.flashBonus !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["flashBonus"],
        message: "A flash bonus only applies to the Points format.",
      });
    }
  })
  .transform((settings) => ({
    format: settings.format,
    flashBonus:
      settings.format === SCORING_FORMAT.POINTS ? (settings.flashBonus ?? 0) : 0,
  }));
