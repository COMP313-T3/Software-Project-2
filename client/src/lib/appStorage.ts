/** Every key the app keeps in browser storage starts with this, so logging out can find them. */
export const APP_STORAGE_PREFIX = "topsend.";

/**
 * Deletes everything the app keeps in this browser's local and session storage, so the next
 * person on a shared device finds nothing. Other sites' and libraries' keys are left alone.
 */
export function clearAppStorage(): void {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[name];
      const keys = Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      );
      for (const key of keys) {
        if (key?.startsWith(APP_STORAGE_PREFIX)) storage.removeItem(key);
      }
    } catch {
      continue;
    }
  }
}
