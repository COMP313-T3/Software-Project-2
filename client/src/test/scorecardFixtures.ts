import type { Scorecard, ScorecardRoute } from "../lib/scorecardApi.ts";

export const SCORECARD_COMPETITION = "507f1f77bcf86cd799439011";

function route(
  number: string,
  status: ScorecardRoute["status"],
  result: ScorecardRoute["result"],
  extra: Partial<ScorecardRoute> = {},
): ScorecardRoute {
  const labels = {
    FLASHED: "Flashed",
    SENT: "Sent",
    ATTEMPTED: "Attempted, not sent yet",
    NOT_ATTEMPTED: "Not attempted yet",
  };
  return {
    routeId: `route-${number}`,
    routeNumber: number,
    name: null,
    grade: "V3",
    pointValue: 500,
    status,
    statusLabel: labels[status],
    completed: status === "FLASHED" || status === "SENT",
    result,
    ...extra,
  };
}

/** A confirmed Climber's scorecard with 2 completed and 3 unfinished problems, worth 860 points. */
export function scorecardFixture(): Scorecard {
  return {
    competition: {
      _id: SCORECARD_COMPETITION,
      name: "US031 Scorecard Test",
      date: "2026-11-21",
      location: "123 Wall St, Toronto",
      status: "PUBLISHED",
      upcoming: true,
      gym: { _id: "507f1f77bcf86cd799439012", name: "North Wall", active: true },
    },
    climber: { firstName: "Sam", lastName: "Rivera" },
    registration: {
      registrationId: "507f1f77bcf86cd799439013",
      status: "CONFIRMED",
      statusLabel: "Confirmed",
      confirmed: true,
      division: { _id: "507f1f77bcf86cd799439014", name: "Open" },
    },
    scoring: { deductionPercent: 20, maxAttempts: 5, label: "20% off for each failed attempt, up to 5 attempts" },
    selfScoring: { open: true, reason: null },
    summary: {
      routeCount: 5,
      completed: 2,
      unfinished: 3,
      flashes: 1,
      attempted: 1,
      notAttempted: 2,
      totalAttempts: 6,
      totalScore: 860,
    },
    routes: [
      route("1", "FLASHED", { attempts: 1, sends: 1, sent: true, flash: true, officialScore: 500, attemptsLeft: 0, updatedAt: "2026-11-09T06:10:00.000Z" }, { name: "Crimp Ladder", grade: "V2" }),
      route("2", "SENT", { attempts: 3, sends: 1, sent: true, flash: false, officialScore: 360, attemptsLeft: 0, updatedAt: "2026-11-09T06:12:00.000Z" }),
      route("3", "ATTEMPTED", { attempts: 2, sends: 0, sent: false, flash: false, officialScore: 0, attemptsLeft: 3, updatedAt: "2026-11-09T06:15:00.000Z" }, { grade: "V4" }),
      route("10", "NOT_ATTEMPTED", null, { grade: "V5" }),
      route("12", "NOT_ATTEMPTED", null, { grade: "V6", pointValue: null }),
    ],
    lastResultAt: "2026-11-09T06:15:00.000Z",
    generatedAt: "2026-11-09T06:20:00.000Z",
  };
}

/**
 * A scorecard with more problems than one page of the sheet holds: the first two are sent, and
 * the rest aren't attempted yet.
 *
 * @param count How many problems it has.
 */
export function longScorecardFixture(count = 23): Scorecard {
  const card = scorecardFixture();
  card.routes = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1);
    if (index > 1) return route(number, "NOT_ATTEMPTED", null);
    return route(number, "SENT", {
      attempts: 2,
      sends: 1,
      sent: true,
      flash: false,
      officialScore: 400,
      attemptsLeft: 0,
      updatedAt: "2026-11-09T06:12:00.000Z",
    });
  });
  card.summary = {
    routeCount: count,
    completed: 2,
    unfinished: count - 2,
    flashes: 0,
    attempted: 0,
    notAttempted: count - 2,
    totalAttempts: 4,
    totalScore: 800,
  };
  return card;
}

/**
 * The same scorecard after a send was recorded on problem 3, generated later.
 *
 * @param generatedAt When the update was generated.
 */
export function sentProblemThree(generatedAt = "2026-11-09T06:25:00.000Z"): Scorecard {
  const card = scorecardFixture();
  card.routes[2] = route(
    "3",
    "SENT",
    { attempts: 3, sends: 1, sent: true, flash: false, officialScore: 360, attemptsLeft: 0, updatedAt: "2026-11-09T06:24:00.000Z" },
    { grade: "V4" },
  );
  card.summary = { ...card.summary, completed: 3, unfinished: 2, attempted: 0, totalAttempts: 7, totalScore: 1220 };
  card.lastResultAt = "2026-11-09T06:24:00.000Z";
  card.generatedAt = generatedAt;
  return card;
}
