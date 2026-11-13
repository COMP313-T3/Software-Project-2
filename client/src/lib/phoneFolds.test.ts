import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppStorage } from "./appStorage.ts";
import { readFoldOpen, saveFoldOpen } from "./phoneFolds.ts";

const KEY = "topsend.layout.fold.scorecard-overview";

beforeEach(() => {
  window.localStorage.clear();
  readFoldOpen("scorecard-overview");
  readFoldOpen("sheet-details");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NR-005 remembering the sections that fold on a phone", () => {
  it("starts a section folded", () => {
    expect(readFoldOpen("scorecard-overview")).toBe(false);
  });

  it("starts a section open when it holds something the user has to read", () => {
    expect(readFoldOpen("scorecard-overview", true)).toBe(true);
  });

  it("keeps the user's choice under TopSend's own key, whichever way the section starts", () => {
    saveFoldOpen("scorecard-overview", true);
    expect(window.localStorage.getItem(KEY)).toBe("open");
    expect(readFoldOpen("scorecard-overview")).toBe(true);

    saveFoldOpen("scorecard-overview", false);
    expect(window.localStorage.getItem(KEY)).toBe("closed");
    expect(readFoldOpen("scorecard-overview", true)).toBe(false);
  });

  it("keeps each section's choice apart", () => {
    saveFoldOpen("scorecard-overview", true);

    expect(readFoldOpen("sheet-details")).toBe(false);
  });

  it("goes back to how the section starts after logging out clears the browser", () => {
    saveFoldOpen("scorecard-overview", true);

    clearAppStorage();

    expect(readFoldOpen("scorecard-overview")).toBe(false);
  });

  it("ignores a stored value it doesn't know", () => {
    window.localStorage.setItem(KEY, "sideways");

    expect(readFoldOpen("scorecard-overview")).toBe(false);
    expect(readFoldOpen("scorecard-overview", true)).toBe(true);
  });

  it("still keeps the choice while the browser's storage can't be used", () => {
    for (const method of ["getItem", "setItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    }

    expect(readFoldOpen("scorecard-overview")).toBe(false);
    expect(() => saveFoldOpen("scorecard-overview", true)).not.toThrow();
    expect(readFoldOpen("scorecard-overview")).toBe(true);
    saveFoldOpen("scorecard-overview", false);
    expect(readFoldOpen("scorecard-overview", true)).toBe(false);
  });
});
