import type {
  ClimberAssistantAnswer,
  ClimberAssistantAvailability,
  ClimberAssistantData,
  RouteToTry,
} from "../lib/climberAssistantApi.ts";

export const ASSISTANT_COMPETITION = "507f1f77bcf86cd799439011";
export const ASSISTANT_NOTICE =
  "AI-generated. May be inaccurate. Official scores are not affected. Other Climbers' results can still change the standings, so no answer guarantees a place.";

export function routeThree(): RouteToTry {
  return {
    route: "3",
    grade: "V5",
    points: 300,
    yourAttempts: 0,
    attemptsLeft: 5,
    pointsIfToppedNextAttempt: 300,
    climbersWithResults: 2,
    completionRatePercent: 100,
    averageAttempts: 1.5,
    flashRatePercent: 50,
    enoughData: false,
  };
}

export function routeFour(): RouteToTry {
  return {
    route: "4",
    name: "Blue Roof",
    grade: "V4",
    points: 200,
    yourAttempts: 2,
    attemptsLeft: 3,
    pointsIfToppedNextAttempt: 120,
    climbersWithResults: 4,
    completionRatePercent: 75,
    averageAttempts: 2.25,
    flashRatePercent: 25,
    enoughData: true,
  };
}

/** A Climber in 3rd place of 5 in Open, with two routes left to score on. */
export function assistantData(): ClimberAssistantData {
  return {
    competition: { name: "Fall Boulder Bash", date: "2026-11-14", finished: false },
    scoring: { deductionPercent: 20, maxAttempts: 5 },
    you: {
      division: "Open",
      place: 3,
      tied: false,
      climbersInDivision: 5,
      totalScore: 260,
      routesTopped: 2,
      flashes: 1,
      pointsBehindLeader: 200,
    },
    placesAbove: [
      { place: 1, totalScore: 460, pointsToTie: 200 },
      { place: 2, totalScore: 300, pointsToTie: 40 },
    ],
    divisionPlaces: [
      { place: 1, totalScore: 460, climbers: 1 },
      { place: 2, totalScore: 300, climbers: 1 },
      { place: 3, totalScore: 260, climbers: 1, yours: true },
      { place: 4, totalScore: 0, climbers: 2 },
    ],
    routesToTry: [routeThree(), routeFour()],
    completedRoutes: [
      { route: "1", name: "Crimp Ladder", grade: "V2", attempts: 3, flash: false, pointsEarned: 60 },
      { route: "2", grade: "V3", attempts: 1, flash: true, pointsEarned: 200 },
    ],
    cantScore: [{ route: "5", grade: "V6", yourAttempts: 5, reason: "no attempts left" }],
    minimumResultsForComparison: 3,
  };
}

export function assistantAvailability(): ClimberAssistantAvailability {
  return {
    competition: {
      _id: ASSISTANT_COMPETITION,
      name: "Fall Boulder Bash",
      date: "2026-11-14",
      gym: { _id: "507f1f77bcf86cd799439012", name: "North Wall" },
    },
    enabled: true,
    canAsk: true,
    reasons: [],
    limits: { questionMaxLength: 300, questionsPerHour: 20 },
    notice: ASSISTANT_NOTICE,
    basedOn: assistantData(),
  };
}

export function assistantAnswer(): ClimberAssistantAnswer {
  const { competition, notice, basedOn } = assistantAvailability();
  return {
    competition,
    notice,
    page: "scorecard",
    question: "Which route should I try next?",
    answer:
      "Try Route 4 next. A top on your next attempt is worth 120 points.\n\nRoute 3 is worth more, but only 2 Climbers have tried it.",
    recommendedRoutes: [routeFour(), routeThree()],
    truncated: false,
    basedOn,
    answeredAt: "2026-11-14T16:30:00.000Z",
  };
}
