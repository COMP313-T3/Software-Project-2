import type { OfficialResult, ResultEntry, ResultOptions } from "../lib/resultsApi.ts";
export const RESULT_COMPETITION = "507f1f77bcf86cd799439011";
export const RESULT_CLIMBER = "507f1f77bcf86cd799439031";
export const RESULT_OTHER_CLIMBER = "507f1f77bcf86cd799439032";
export const RESULT_ROUTE = "507f1f77bcf86cd799439021";
export const RESULT_OTHER_ROUTE = "507f1f77bcf86cd799439022";
export const resultOptions: ResultOptions = {
  competition: { _id: RESULT_COMPETITION, name: "Local Boulder Open", date: "2026-01-01", status: "PUBLISHED" },
  scoring: { deductionPercent: 20, maxAttempts: 5, label: "20% off for each failed attempt, up to 5 attempts", records: { attempts: true, sends: true, flash: true } },
  canRecord: { allowed: true, reasons: [] },
  climbers: [
    { _id: RESULT_CLIMBER, firstName: "Ada", lastName: "Climber", registrationStatus: "CONFIRMED", division: { _id: "507f1f77bcf86cd799439041", name: "Open" } },
    { _id: RESULT_OTHER_CLIMBER, firstName: "Ben", lastName: "Sender", registrationStatus: "CONFIRMED", division: null },
  ],
  routes: [
    { _id: RESULT_ROUTE, routeNumber: "1", name: "Yellow Slab", grade: "V2", pointValue: 100 },
    { _id: RESULT_OTHER_ROUTE, routeNumber: "2", name: null, grade: "V4", pointValue: 200 },
  ],
};
export const emptyResultEntry: ResultEntry = {
  competitionId: RESULT_COMPETITION, climber: resultOptions.climbers[0], route: resultOptions.routes[0],
  scoring: { deductionPercent: 20, maxAttempts: 5, label: resultOptions.scoring!.label },
  result: null, attemptsLeft: 5, climberTotal: { totalScore: 0, sends: 0, flashes: 0, attempts: 0, problemsRecorded: 0 },
};
export function savedResult(overrides: Partial<OfficialResult> = {}): ResultEntry {
  return {
    ...structuredClone(emptyResultEntry), attemptsLeft: 0,
    result: { resultId: "507f1f77bcf86cd799439051", competitionId: RESULT_COMPETITION, climberId: RESULT_CLIMBER, routeId: RESULT_ROUTE,
      attempts: 1, sent: true, sends: 1, flash: true, officialScore: 100, updatedAt: "2026-01-01T12:00:00.000Z", ...overrides },
    climberTotal: { totalScore: overrides.officialScore ?? 100, sends: overrides.sends ?? 1, flashes: overrides.flash === false ? 0 : 1, attempts: overrides.attempts ?? 1, problemsRecorded: 1 },
  };
}
