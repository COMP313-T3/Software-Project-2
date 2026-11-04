import mongoose from "mongoose";
import { Competition } from "../models/Competition.js";
import { OfficialResult } from "../models/OfficialResult.js";
import { Route } from "../models/Route.js";
import { scoreProblem } from "../utils/officialScoring.js";
import { savedScoring } from "../utils/scoringSettings.js";

/**
 * The rules one problem's results are scored with: its point value and the competition's scoring
 * settings.
 *
 * @param {{ deductionPercent: number, maxAttempts: number }} scoring The competition's settings.
 * @param {{ pointValue?: number }} route The problem.
 * @returns {{ pointValue: number, deductionPercent: number, maxAttempts: number }}
 */
export function rulesFor(scoring, route) {
  return {
    pointValue: Number.isInteger(route?.pointValue) ? route.pointValue : 0,
    deductionPercent: scoring.deductionPercent,
    maxAttempts: scoring.maxAttempts,
  };
}

function sameRules(a, b) {
  return (
    a?.pointValue === b.pointValue &&
    a?.deductionPercent === b.deductionPercent &&
    a?.maxAttempts === b.maxAttempts
  );
}

/**
 * Calculates the official scores of a competition's results again from its current scoring
 * settings and its problems' current point values (US-018 criterion 3, US-019 criterion 6). It
 * runs when the Gym Admin changes the scoring or a problem's points, so every saved score always
 * follows the rules in force. Only scores that change are written.
 *
 * @param {import("mongoose").Types.ObjectId | string} competitionId The competition.
 * @param {{ routeId?: import("mongoose").Types.ObjectId | string }} [options] Only this problem's
 *   results, when its point value changed.
 * @returns {Promise<number>} How many results got a new score.
 */
export async function rescoreResults(competitionId, { routeId } = {}) {
  const competition = await Competition.findById(competitionId, "scoring").lean();
  const scoring = savedScoring(competition?.scoring);
  if (!scoring) return 0;

  const resultFilter = { competitionId };
  const routeFilter = { competitionId };
  if (routeId) {
    resultFilter.routeId = routeId;
    routeFilter._id = routeId;
  }
  const [results, routes] = await Promise.all([
    OfficialResult.find(resultFilter, "routeId attempts sends officialScore scoredWith").lean(),
    Route.find(routeFilter, "pointValue").lean(),
  ]);
  const routesById = new Map(routes.map((route) => [String(route._id), route]));

  const updates = [];
  for (const result of results) {
    const scoredWith = rulesFor(scoring, routesById.get(String(result.routeId)));
    const officialScore = scoreProblem(scoredWith, {
      attempts: result.attempts,
      sent: result.sends === 1,
    });
    if (officialScore === result.officialScore && sameRules(result.scoredWith, scoredWith)) {
      continue;
    }
    updates.push({
      updateOne: {
        filter: { _id: result._id },
        update: { $set: { officialScore, scoredWith }, $inc: { version: 1 } },
      },
    });
  }
  if (updates.length > 0) await OfficialResult.bulkWrite(updates, { ordered: false });
  return updates.length;
}
