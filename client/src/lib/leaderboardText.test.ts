import { describe, expect, it } from "vitest";
import { ordinal, pointsText } from "./leaderboardText.ts";

describe("US-032 leaderboard wording", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [101, "101st"],
    [111, "111th"],
  ])("says place %i as %s", (place, text) => {
    expect(ordinal(place)).toBe(text);
  });

  it.each([
    [0, "0 points"],
    [1, "1 point"],
    [20, "20 points"],
  ])("says %i points as %s", (count, text) => {
    expect(pointsText(count)).toBe(text);
  });
});
