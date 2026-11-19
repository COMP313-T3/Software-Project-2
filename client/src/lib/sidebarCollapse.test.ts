import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppStorage } from "./appStorage.ts";
import { readSidebarCollapsed, saveSidebarCollapsed } from "./sidebarCollapse.ts";

const KEY = "topsend.layout.sidebarCollapsed";

beforeEach(() => {
  window.localStorage.clear();
  readSidebarCollapsed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NR-005 remembering a collapsed desktop sidebar", () => {
  it("starts with the full sidebar", () => {
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("keeps a collapsed sidebar under TopSend's own key, and forgets the key once it's opened again", () => {
    saveSidebarCollapsed(true);
    expect(window.localStorage.getItem(KEY)).toBe("true");
    expect(readSidebarCollapsed()).toBe(true);

    saveSidebarCollapsed(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("opens the full sidebar again after logging out clears the browser", () => {
    saveSidebarCollapsed(true);

    clearAppStorage();

    expect(readSidebarCollapsed()).toBe(false);
  });

  it("still keeps the choice while the browser's storage can't be used", () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    }

    expect(() => saveSidebarCollapsed(true)).not.toThrow();
    expect(readSidebarCollapsed()).toBe(true);
    saveSidebarCollapsed(false);
    expect(readSidebarCollapsed()).toBe(false);
  });
});
