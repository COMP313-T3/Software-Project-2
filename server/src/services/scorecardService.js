import { Competition } from "../models/Competition.js";
import { Gym } from "../models/Gym.js";
import { OfficialResult } from "../models/OfficialResult.js";
import { Registration } from "../models/Registration.js";
import { Route } from "../models/Route.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import { assertStarted } from "../utils/competitionStart.js";
import { assertScorecardAccess, buildScorecard } from "../utils/scorecard.js";

/**
 * The logged-in Climber's digital scorecard for one competition (US-031): the competition's
 * official boulder problems, each with the Climber's official result or null when there isn't one
 * yet, and their totals.
 *
 * Privacy (criterion 5): climberId always comes from the access token, never from the request, and
 * both the registration and the results are matched on it, so no request can read another
 * Climber's scorecard. Only official results are read, and nothing is written.
 *
 * Used by GET /api/competitions/:competitionId/scorecard and by the live scorecard
 * (realtime/scorecardSocket.js), so both always answer the same shape.
 *
 * A scorecard opens when its competition starts (AC-021). Until then a registered Climber gets
 * 409 COMPETITION_NOT_STARTED, after the checks that decide whether they may see it at all, so the
 * refusal tells nobody else when a competition starts.
 *
 * @param {string} climberId The Climber, from the access token.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<object>} The scorecard (see utils/scorecard.js).
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, 404 REGISTRATION_NOT_FOUND, or 409
 *   COMPETITION_NOT_STARTED.
 */
export async function getMyScorecard(climberId, competitionId) {
  const [competition, registration] = await Promise.all([
    Competition.findById(competitionId, "gymId name date startTime endTime location status scoring").lean(),
    Registration.findOne({ competitionId, climberId }, "status divisionId climberId")
      .populate("divisionId", "name")
      .populate("climberId", "firstName lastName")
      .lean(),
  ]);
  const gym = competition ? await Gym.findById(competition.gymId, "name status").lean() : null;
  assertScorecardAccess({ competition, gym, registration });
  assertStarted(competition);

  const [routes, results] = await Promise.all([
    Route.find({ competitionId: competition._id }, "routeNumber name grade pointValue official").lean(),
    OfficialResult.find(
      { competitionId: competition._id, climberId },
      "routeId attempts sends flash officialScore updatedAt",
    ).lean(),
  ]);

  return buildScorecard({
    competition,
    gym,
    registration,
    routes,
    results,
    today: parseCalendarDate(torontoToday()).date,
  });
}
