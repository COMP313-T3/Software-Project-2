const SIDEBAR_KEY = "topsend.layout.sidebarCollapsed";

/** The choice while the browser's storage can't be used, so it still lasts from page to page. */
let collapsedHere = false;

/**
 * Whether the user collapsed the desktop sidebar to its slim strip. The browser keeps the choice
 * until the user logs out, like everything else TopSend keeps there.
 */
export function readSidebarCollapsed(): boolean {
  try {
    collapsedHere = window.localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return collapsedHere;
  }
  return collapsedHere;
}

/**
 * Remembers whether the desktop sidebar is collapsed, so every page opens the same way.
 *
 * @param collapsed True for the slim strip, false for the full sidebar.
 */
export function saveSidebarCollapsed(collapsed: boolean) {
  collapsedHere = collapsed;
  try {
    if (collapsed) window.localStorage.setItem(SIDEBAR_KEY, "true");
    else window.localStorage.removeItem(SIDEBAR_KEY);
  } catch {
    return;
  }
}
