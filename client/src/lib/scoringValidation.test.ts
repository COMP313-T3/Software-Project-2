import { describe, expect, it } from "vitest";
import {
  SCORING_ATTEMPTS_MESSAGE, SCORING_DEDUCTION_MESSAGE, largestDeduction, savedScoring, validateScoring,
} from "./scoringValidation.ts";
import type { SavedScoring } from "./scoringApi.ts";

const lastAttempt = (attempts: number, largest: number) =>
  `With ${attempts} attempts, the deduction can be at most ${largest}% so a top on the last attempt still scores.`;

describe("US-018 scoring settings validation", () => {
  it("says the limits the way the API does", () => {
    expect(SCORING_DEDUCTION_MESSAGE).toBe("Enter a whole-number percentage from 0 to 99.");
    expect(SCORING_ATTEMPTS_MESSAGE).toBe("Enter a whole number of attempts from 1 to 20.");
  });
  it.each([[1, 99], [2, 99], [3, 49], [4, 33], [5, 24], [6, 19], [11, 9], [20, 5]])(
    "allows at most the largest deduction that still scores with %i attempts (%i)", (attempts, largest) => {
      expect(largestDeduction(attempts)).toBe(largest);
      expect(largest * (attempts - 1)).toBeLessThan(100);
      if (largest < 99) expect((largest + 1) * (attempts - 1)).toBeGreaterThanOrEqual(100);
    },
  );
  it.each([["20", "5"], [" 20 ", " 5 "], ["0", "1"], ["99", "1"], ["99", "2"], ["24", "5"], ["5", "20"], ["0", "20"]])(
    "accepts a deduction of %j with %j attempts", (deductionPercent, maxAttempts) => {
      expect(validateScoring({ deductionPercent, maxAttempts })).toEqual({});
    },
  );
  it.each(["", "   ", "-1", "0.5", "100", "1e1", "abc"])("rejects the deduction %j", deductionPercent => {
    expect(validateScoring({ deductionPercent, maxAttempts: "5" })).toEqual({ deductionPercent: SCORING_DEDUCTION_MESSAGE });
  });
  it.each(["", "0", "21", "2.5", "-3", "abc"])("rejects %j attempts without quoting them in a deduction message", maxAttempts => {
    expect(validateScoring({ deductionPercent: "60", maxAttempts })).toEqual({ maxAttempts: SCORING_ATTEMPTS_MESSAGE });
  });
  it.each([["25", "5", 24], ["50", "3", 49], ["6", "20", 5], ["34", "4", 33]])(
    "refuses a deduction of %s with %s attempts, so a top on the last attempt still scores", (deductionPercent, maxAttempts, largest) => {
      expect(validateScoring({ deductionPercent, maxAttempts })).toEqual({ deductionPercent: lastAttempt(Number(maxAttempts), largest) });
    },
  );
});

describe("US-018 saved scoring", () => {
  it("keeps valid saved settings as they are", () => {
    const scoring: SavedScoring = { deductionPercent: 20, maxAttempts: 5, updatedBy: "admin", updatedAt: "2026-10-21T12:00:00Z" };
    expect(savedScoring(scoring)).toBe(scoring);
  });
  it.each([
    undefined, null, { format: "POINTS", flashBonus: 10 }, { format: "TOPS", flashBonus: 0 },
    { deductionPercent: 30, maxAttempts: 5 }, { deductionPercent: 20, maxAttempts: 0 }, { deductionPercent: 2.5, maxAttempts: 5 },
  ])("treats %j as not set", scoring => {
    expect(savedScoring(scoring as SavedScoring | null | undefined)).toBeNull();
  });
});
