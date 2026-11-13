const FOLD_KEY = "topsend.layout.fold.";

/** The choices while the browser's storage can't be used, so they still last from page to page. */
const chosenHere = new Map<string, boolean>();

/**
 * Whether a section that folds into a bar on a phone is open. A section starts folded, unless it
 * holds something the user has to read, until the user opens or folds it themselves. The browser
 * keeps that choice until the user logs out, like everything else TopSend keeps there.
 *
 * @param name The section's name, such as scorecard-overview.
 * @param startsOpen Whether the section is open until the user chooses.
 */
export function readFoldOpen(name: string, startsOpen = false): boolean {
  try {
    const stored = window.localStorage.getItem(FOLD_KEY + name);
    if (stored === "open" || stored === "closed") chosenHere.set(name, stored === "open");
    else chosenHere.delete(name);
  } catch {
    return chosenHere.get(name) ?? startsOpen;
  }
  return chosenHere.get(name) ?? startsOpen;
}

/**
 * Remembers whether the user opened or folded a section, so it opens the same way next time.
 *
 * @param name The section's name.
 * @param open True when the user opened it, false when they folded it.
 */
export function saveFoldOpen(name: string, open: boolean) {
  chosenHere.set(name, open);
  try {
    window.localStorage.setItem(FOLD_KEY + name, open ? "open" : "closed");
  } catch {
    return;
  }
}
