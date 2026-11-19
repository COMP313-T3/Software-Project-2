import { describe, expect, it } from "vitest";
import { assertOfficialResultWriter } from "../src/services/officialResultService.js";
import { isFlash, scoreProblem, summarizeResults } from "../src/utils/officialScoring.js";

describe("US-019 official server scoring -> FR-010 / AC-014", () => {
  it.each([[1, 100], [2, 80], [3, 60], [4, 40], [5, 20]])("scores a send in %s attempts as %s points using the documented competition rules", (attempts, expected) => {
    expect(scoreProblem({ pointValue: 100, deductionPercent: 20, maxAttempts: 5 }, { attempts, sent: true })).toBe(expected);
  });
  it.each([[0, false], [3, false], [6, true]])("scores no valid top as zero (%s attempts, sent %s)", (attempts, sent) => {
    expect(scoreProblem({ pointValue: 100, deductionPercent: 20, maxAttempts: 5 }, { attempts, sent })).toBe(0);
  });
  it("rounds to whole points and supports an actual zero-point problem", () => {
    expect(scoreProblem({ pointValue: 83, deductionPercent: 15, maxAttempts: 5 }, { attempts: 2, sent: true })).toBe(71);
    expect(scoreProblem({ pointValue: 0, deductionPercent: 20, maxAttempts: 5 }, { attempts: 1, sent: true })).toBe(0);
  });
  it("records a flash only for a first-attempt send", () => {
    expect(isFlash({ attempts: 1, sent: true })).toBe(true);
    expect(isFlash({ attempts: 1, sent: false })).toBe(false);
    expect(isFlash({ attempts: 2, sent: true })).toBe(false);
  });
  it("summarizes official recorded results without inventing scores for other problems", () => {
    expect(summarizeResults([{ attempts: 1, sends: 1, flash: true, officialScore: 100 }, { attempts: 2, sends: 1, flash: false, officialScore: 80 }, { attempts: 3, sends: 0, flash: false, officialScore: 0 }])).toEqual({ totalScore: 180, sends: 2, flashes: 1, attempts: 6, problemsRecorded: 3 });
  });
  it.each([undefined, { userId: "user", role: "ADMIN" }, { userId: "user", role: "CLIMBER" }, { userId: "ai", role: "AI" }, { role: "GYM_ADMIN" }])("rejects non-Gym-Admin official writers at the service boundary %#", actor => {
    expect(() => assertOfficialResultWriter(actor)).toThrow("Only a Gym Administrator");
  });
});
