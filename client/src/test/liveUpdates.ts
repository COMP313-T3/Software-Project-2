import { act } from "@testing-library/react";
import { vi } from "vitest";
import { followChanges, type ChangeListener, type PageChange } from "../lib/liveChanges.ts";

/**
 * Lets a page test play the server's live page updates: every page that listens is told what
 * announce is given, or that changes may have been missed when it's given null.
 */
export function liveUpdates() {
  const listeners = new Set<ChangeListener>();
  vi.mocked(followChanges).mockImplementation((_userId, listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  return {
    /** How many pages are listening right now. */
    listening: () => listeners.size,
    async announce(changes: PageChange[] | null) {
      await act(async () => {
        for (const listener of [...listeners]) listener(changes);
      });
    },
  };
}
