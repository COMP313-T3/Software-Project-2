import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAppStorage } from "./appStorage.ts";
import { dueEndWarning, nextEndWarningIn, rememberEndWarning, shownEndWarnings } from "./endWarnings.ts";

const MINUTE = 60_000;

afterEach(() => {
  clearAppStorage();
  vi.restoreAllMocks();
});

describe("the warnings before a competition ends (AC-024)", () => {
  it("is due 15 minutes before the end, and again 5 minutes before it", () => {
    expect(dueEndWarning("bash", 15 * MINUTE + 1)).toBeNull();
    expect(dueEndWarning("bash", 15 * MINUTE)).toBe(15);
    expect(dueEndWarning("bash", 6 * MINUTE)).toBe(15);
    expect(dueEndWarning("bash", 5 * MINUTE)).toBe(5);
    expect(dueEndWarning("bash", 1000)).toBe(5);
  });

  it("is never due once the competition has ended", () => {
    expect(dueEndWarning("bash", 0)).toBeNull();
    expect(dueEndWarning("bash", -MINUTE)).toBeNull();
  });

  it("opens each warning once, and a page opened late skips the earlier one", () => {
    rememberEndWarning("bash", 15);
    expect(dueEndWarning("bash", 14 * MINUTE)).toBeNull();
    expect(dueEndWarning("bash", 4 * MINUTE)).toBe(5);

    rememberEndWarning("fest", 5);
    expect(shownEndWarnings("fest").sort()).toEqual([15, 5].sort());
    expect(dueEndWarning("fest", 3 * MINUTE)).toBeNull();
  });

  it("keeps each competition's warnings apart", () => {
    rememberEndWarning("bash", 15);
    expect(dueEndWarning("fest", 14 * MINUTE)).toBe(15);
  });

  it("remembers them in this browser until logout, under TopSend's own key", () => {
    rememberEndWarning("bash", 15);
    expect(window.localStorage.getItem("topsend.endWarnings")).toBe(JSON.stringify({ bash: [15] }));

    clearAppStorage();
    expect(window.localStorage.getItem("topsend.endWarnings")).toBeNull();
  });

  it("still opens each warning once on this page when browser storage can't be used", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is off");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is off");
    });

    expect(dueEndWarning("blocked", 10 * MINUTE)).toBe(15);
    rememberEndWarning("blocked", 15);
    expect(dueEndWarning("blocked", 10 * MINUTE)).toBeNull();
  });

  it("says how long until the next warning, and nothing once both have come", () => {
    expect(nextEndWarningIn(20 * MINUTE)).toBe(5 * MINUTE);
    expect(nextEndWarningIn(10 * MINUTE)).toBe(5 * MINUTE);
    expect(nextEndWarningIn(5 * MINUTE)).toBeNull();
    expect(nextEndWarningIn(MINUTE)).toBeNull();
  });
});
