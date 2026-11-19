import { z } from "zod";
import { DISPLAY_BACKGROUNDS } from "../constants/displaySettings.js";

const IMAGE_REFERENCE_MAX_LENGTH = 2048;
const imageReferenceMessage = "Enter a valid image URL or asset reference.";

const imageReference = z
  .string({ error: imageReferenceMessage })
  .trim()
  .min(1, { error: imageReferenceMessage })
  .max(IMAGE_REFERENCE_MAX_LENGTH, {
    error: `Use ${IMAGE_REFERENCE_MAX_LENGTH} characters or fewer.`,
  })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "https:" || url.protocol === "http:") &&
          !url.username &&
          !url.password
        );
      } catch {
        return (
          !/^[a-z][a-z\d+.-]*:/i.test(value) &&
          !/[\s\\]/.test(value)
        );
      }
    },
    { error: imageReferenceMessage },
  );

/** Complete replacement body for PUT /api/gym-admin/competitions/:competitionId/display-settings. */
export const displaySettingsSchema = z
  .object({
    logo: imageReference.nullable(),
    background: z
      .enum(DISPLAY_BACKGROUNDS, {
        error: "Choose one of TopSend's backgrounds, or none for plain white.",
      })
      .nullable(),
    sponsors: z.array(imageReference),
  })
  .strict();
