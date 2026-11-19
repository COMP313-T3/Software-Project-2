/** The lowest opacity a Climber can give the scorecard sheet's white background, in percent. */
export const SHEET_OPACITY_MIN = 10;

/** The highest opacity, which is also the sheet's normal look: a solid white sheet. */
export const SHEET_OPACITY_MAX = 100;

/** How far one step of the opacity setting moves it, in percent. */
export const SHEET_OPACITY_STEP = 10;

const SHEET_OPACITY_KEY = "topsend.scorecard.sheetOpacity";

/**
 * An opacity the sheet can use: on a step, from the lowest to the highest. Anything that isn't a
 * number gives the normal, solid sheet.
 *
 * @param value The opacity in percent.
 */
export function sheetOpacity(value: number): number {
  if (!Number.isFinite(value)) return SHEET_OPACITY_MAX;
  const stepped = Math.round(value / SHEET_OPACITY_STEP) * SHEET_OPACITY_STEP;
  return Math.min(SHEET_OPACITY_MAX, Math.max(SHEET_OPACITY_MIN, stepped));
}

/**
 * The opacity this browser remembers for the sheet, or the solid sheet when none is remembered. Like
 * everything else TopSend keeps in the browser, it's forgotten when the user logs out.
 */
export function readSheetOpacity(): number {
  try {
    const stored = window.localStorage.getItem(SHEET_OPACITY_KEY);
    return stored === null ? SHEET_OPACITY_MAX : sheetOpacity(Number.parseInt(stored, 10));
  } catch {
    return SHEET_OPACITY_MAX;
  }
}

/**
 * Remembers the sheet's opacity in this browser, so the sheet keeps it on the next visit.
 *
 * @param value The opacity in percent.
 */
export function saveSheetOpacity(value: number) {
  try {
    window.localStorage.setItem(SHEET_OPACITY_KEY, String(sheetOpacity(value)));
  } catch {
    return;
  }
}
