import type { Leaderboard, LeaderboardAudience } from "../lib/leaderboardApi.ts";
export const BOARD_COMPETITION = "507f1f77bcf86cd799439011";
export const BOARD_DIVISION = "507f1f77bcf86cd799439041";
export function boardFixture(audience: LeaderboardAudience = "manage"): Leaderboard {
  return {
    audience, competition: { _id: BOARD_COMPETITION, name: "Brian Boulder Open", date: "2026-11-05", status: "PUBLISHED", gym: { _id: "gym", name: "Brian Test Gym" }, ...(audience === "manage" ? { publicLeaderboard: true } : {}) },
    scoring: { deductionPercent: 20, maxAttempts: 5, label: "20% off for each failed attempt, up to 5 attempts" },
    tiebreakers: ["Highest total score"], routeCount: 3,
    divisions: [
      { _id: BOARD_DIVISION, name: "Open", climberCount: 3, standings: [
        { entryId: "entry-a", rank: 1, tied: false, climber: { firstName: "Ada", lastName: "Climber", ...(audience === "manage" ? { _id: "climber-a" } : {}) }, totalScore: 180, sends: 2, flashes: 1, attemptsToTops: 3, problemsRecorded: 2 },
        { entryId: "entry-b", rank: 2, tied: true, climber: { firstName: "Ben", lastName: "Sender", ...(audience === "manage" ? { _id: "climber-b" } : {}) }, totalScore: 80, sends: 1, flashes: 0, attemptsToTops: 2, problemsRecorded: 1 },
        { entryId: "entry-c", rank: 2, tied: true, climber: { firstName: "Cara", lastName: "Climber", ...(audience === "manage" ? { _id: "climber-c" } : {}) }, totalScore: 80, sends: 1, flashes: 0, attemptsToTops: 2, problemsRecorded: 1 },
      ] },
      { _id: "youth", name: "Youth", climberCount: 0, standings: [] },
    ],
    ...(audience === "climber" ? { myEntry: { entryId: "entry-b", division: { _id: BOARD_DIVISION, name: "Open" }, rank: 2, tied: true, totalScore: 80, of: 3 } } : {}),
    lastResultAt: "2026-11-05T12:00:00.000Z", generatedAt: "2026-11-05T12:01:00.000Z",
  };
}
