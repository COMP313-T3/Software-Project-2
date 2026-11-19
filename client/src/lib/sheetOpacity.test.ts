import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSheetOpacity, saveSheetOpacity, sheetOpacity } from "./sheetOpacity.ts";

const KEY = "topsend.scorecard.sheetOpacity";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("US-031 the scorecard sheet's opacity setting", () => {
  it.each([
    [100, 100],
    [10, 10],
    [40, 40],
    [55, 60],
    [44, 40],
    [5, 10],
    [0, 10],
    [-20, 10],
    [140, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
  ])("keeps %s at %s", (value, expected) => {
    expect(sheetOpacity(value)).toBe(expected);
  });

  it("is a solid sheet until the Climber changes it", () => {
    expect(readSheetOpacity()).toBe(100);
  });

  it("is kept in this browser under TopSend's own key, so logging out forgets it", () => {
    saveSheetOpacity(30);

    expect(window.localStorage.getItem(KEY)).toBe("30");
    expect(readSheetOpacity()).toBe(30);
  });

  it.each([
    ["text", "see-through", 100],
    ["an empty value", "", 100],
    ["a value too low", "2", 10],
    ["a value too high", "250", 100],
    ["a value between steps", "73", 70],
  ])("reads %s someone left in storage as a setting the sheet can use", (_label, stored, expected) => {
    window.localStorage.setItem(KEY, stored);

    expect(readSheetOpacity()).toBe(expected);
  });

  it("falls back to the solid sheet, and saves nothing, when the browser's storage can't be used", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveSheetOpacity(20)).not.toThrow();
    expect(readSheetOpacity()).toBe(100);
  });
});
