import desert from "../assets/backgrounds/desert.svg";
import forest from "../assets/backgrounds/forest.svg";
import jungle from "../assets/backgrounds/jungle.svg";
import mountains from "../assets/backgrounds/mountains.svg";
import night from "../assets/backgrounds/night.svg";
import sea from "../assets/backgrounds/sea.svg";
import type { DisplayImage } from "./displayCustomization.ts";

/**
 * The backgrounds a gym can choose for its competition displays and score sheets (US-021). They
 * ship with TopSend, so nothing is uploaded; the API stores the key. The same keys are listed in
 * the server's constants/displaySettings.js.
 */
export const DISPLAY_BACKGROUNDS = [
  { key: "mountains", label: "Mountains", src: mountains },
  { key: "sea", label: "Sea", src: sea },
  { key: "jungle", label: "Jungle", src: jungle },
  { key: "forest", label: "Forest", src: forest },
  { key: "desert", label: "Desert", src: desert },
  { key: "night", label: "Night sky", src: night },
] as const;

export type DisplayBackgroundKey = (typeof DISPLAY_BACKGROUNDS)[number]["key"];

/**
 * The image for a background key, or null for the plain default or a key TopSend doesn't have.
 *
 * @param key The key the API stored.
 */
export function backgroundImage(key: string | null | undefined): DisplayImage | null {
  const choice = DISPLAY_BACKGROUNDS.find((background) => background.key === key);
  return choice ? { src: choice.src, name: `${choice.label} background`, reference: choice.key } : null;
}
