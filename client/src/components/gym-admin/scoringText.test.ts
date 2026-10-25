import { describe, expect, it } from "vitest";
import { describeScoring, scoringExample } from "./scoringText.ts";

describe("US-018 scoring text", () => {
  it("describes the settings in plain words", () => {
    expect(describeScoring({ deductionPercent: 20, maxAttempts: 5 })).toBe("20% off for each failed attempt, up to 5 attempts");
    expect(describeScoring({ deductionPercent: 0, maxAttempts: 20 })).toBe("0% off for each failed attempt, up to 20 attempts");
    expect(describeScoring({ deductionPercent: 10, maxAttempts: 1 })).toBe("10% off for each failed attempt, up to 1 attempt");
  });

  it.each([
    [20, 5, "A 100-point problem scores 100, 80, 60, 40 or 20 points, and 0 if it isn't topped."],
    [25, 4, "A 100-point problem scores 100, 75, 50 or 25 points, and 0 if it isn't topped."],
    [99, 2, "A 100-point problem scores 100 or 1 points, and 0 if it isn't topped."],
    [0, 5, "A 100-point problem scores 100 points, and 0 if it isn't topped."],
    [50, 1, "A 100-point problem scores 100 points, and 0 if it isn't topped."],
  ])("gives a 100-point example for a %i percent deduction with %i attempts", (deductionPercent, maxAttempts, text) => {
    expect(scoringExample({ deductionPercent, maxAttempts })).toBe(text);
  });
});
