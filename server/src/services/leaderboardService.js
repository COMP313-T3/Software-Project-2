import {
  COMPETITION_STATUS,
  REGISTRATION_RECORD_STATUS,
} from "../constants/competitions.js";
import { LEADERBOARD_AUDIENCE, LEADERBOARD_TIEBREAKERS } from "../constants/leaderboard.js";
import { ROLES } from "../constants/roles.js";
import { Competition } from "../models/Competition.js";
import { Division } from "../models/Division.js";
import { Gym } from "../models/Gym.js";
import { OfficialResult } from "../models/OfficialResult.js";
import { Registration } from "../models/Registration.js";
import { Route } from "../models/Route.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { divisionStandings } from "../utils/leaderboardRanking.js";
import { describeScoring, savedScoring } from "../utils/scoringSettings.js";
import { competitionNotFound, findManagedCompetition } from "./competitionAccess.js";

const ACTIVE_GYM = "ACTIVE";
const COMPETITION_FIELDS = "gymId name date status scoring publicLeaderboard";

function leaderboardNotPublic() {
  return new AppError(
    403,
    "LEADERBOARD_NOT_PUBLIC",
    "This competition's leaderboard isn't public. Log in as a registered Climber to see it.",
  );
}

function notRegistered() {
  return new AppError(
    404,
    "REGISTRATION_NOT_FOUND",
    "You're not registered for this competition, and its leaderboard isn't public.",
  );
}

function divisionNotInCompetition() {
  return new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
    divisionId: "Choose a division from this competition.",
  });
}

/** A competition's leaderboard is public when its Gym Admin turned that on and it's discoverable. */
function isPublic(competition, gym) {
  return (
    competition.publicLeaderboard === true &&
    competition.status === COMPETITION_STATUS.PUBLISHED &&
    gym?.status === ACTIVE_GYM
  );
}

// ---------- calculating the standings ----------

/**
 * Reads everything a competition's standings are calculated from (US-020 task: "get the official
 * results for the competition") and ranks them. Every query is limited to this competition, so
 * nothing from another competition can appear in its standings.
 */
async function calculate(competition) {
  const scoring = savedScoring(competition.scoring);
  const [gym, divisions, registrations, routes, results, lastChange] = await Promise.all([
    Gym.findById(competition.gymId, "name status").lean(),
    Division.find({ competitionId: competition._id }, "name").lean(),
    Registration.find(
      { competitionId: competition._id, status: REGISTRATION_RECORD_STATUS.CONFIRMED },
      "climberId divisionId",
    )
      .populate("climberId", "firstName lastName")
      .lean(),
    Route.find({ competitionId: competition._id }, "pointValue official").lean(),
    OfficialResult.find(
      { competitionId: competition._id },
      "climberId routeId attempts sends",
    ).lean(),
    OfficialResult.findOne({ competitionId: competition._id }, "updatedAt")
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  return {
    competition,
    gym,
    scoring,
    routeCount: routes.filter((route) => route.official !== false).length,
    divisions: divisionStandings({ registrations, divisions, routes, results, scoring }),
    lastResultAt: lastChange?.updatedAt ?? null,
  };
}

/**
 * The standings as one audience sees them (US-020 criterion 6, FR-011's role-based visibility).
 * Everyone sees the same ranks, names and totals. Only a Gym Admin of the gym sees Climber account
 * IDs and the public access setting. A Climber also gets their own place, as myEntry. Nobody gets
 * an email, a birth date, or anything else from the Climber's account.
 */
function present(board, audience, { climberId, divisionId } = {}) {
  const manage = audience === LEADERBOARD_AUDIENCE.MANAGE;
  const divisions = board.divisions
    .filter((division) => !divisionId || String(division._id) === divisionId)
    .map((division) => ({
      _id: division._id,
      name: division.name,
      climberCount: division.climberCount,
      standings: division.standings.map((entry) => ({
        entryId: entry.entryId,
        rank: entry.rank,
        tied: entry.tied,
        climber: {
          ...(manage ? { _id: entry.climberId } : {}),
          firstName: entry.firstName,
          lastName: entry.lastName,
        },
        totalScore: entry.totalScore,
        sends: entry.sends,
        flashes: entry.flashes,
        attemptsToTops: entry.attemptsToTops,
        problemsRecorded: entry.problemsRecorded,
      })),
    }));

  let myEntry = null;
  if (audience === LEADERBOARD_AUDIENCE.CLIMBER && climberId) {
    for (const division of board.divisions) {
      const entry = division.standings.find((candidate) => candidate.climberId === climberId);
      if (entry) {
        myEntry = {
          entryId: entry.entryId,
          division: { _id: division._id, name: division.name },
          rank: entry.rank,
          tied: entry.tied,
          totalScore: entry.totalScore,
          of: division.climberCount,
        };
        break;
      }
    }
  }

  const { competition, gym, scoring } = board;
  return {
    audience,
    competition: {
      _id: competition._id,
      name: competition.name,
      date: competition.date.toISOString().slice(0, 10),
      status: competition.status,
      gym: gym ? { _id: gym._id, name: gym.name } : null,
      ...(manage ? { publicLeaderboard: competition.publicLeaderboard === true } : {}),
    },
    scoring: scoring
      ? {
          deductionPercent: scoring.deductionPercent,
          maxAttempts: scoring.maxAttempts,
          label: describeScoring(scoring),
        }
      : null,
    tiebreakers: LEADERBOARD_TIEBREAKERS.map(({ label }) => label),
    routeCount: board.routeCount,
    divisions,
    ...(audience === LEADERBOARD_AUDIENCE.CLIMBER ? { myEntry } : {}),
    lastResultAt: board.lastResultAt,
    generatedAt: new Date(),
  };
}

/**
 * Refuses anyone but the competition's own Gym Admins and Climbers unless the leaderboard is
 * public. A draft, or a competition whose gym isn't active, answers the same 404 as a missing one,
 * so the public route reveals nothing that discovery doesn't.
 */
async function checkPublicAccess(competition) {
  if (competition.status !== COMPETITION_STATUS.PUBLISHED) throw competitionNotFound();
  const gym = await Gym.findById(competition.gymId, "status").lean();
  if (gym?.status !== ACTIVE_GYM) throw competitionNotFound();
  if (!isPublic(competition, gym)) throw leaderboardNotPublic();
}

async function checkDivision(competition, divisionId) {
  if (!divisionId) return;
  const division = await Division.exists({ _id: divisionId, competitionId: competition._id });
  if (!division) throw divisionNotInCompetition();
}

// ---------- the three ways to open a leaderboard ----------

/**
 * The leaderboard of one of the Gym Admin's competitions (US-020 criterion 1), whatever its status
 * or public access setting.
 *
 * @param {{ _id: unknown }[]} gyms The active gyms the user administers, from requireGymAdmin.
 * @param {string} competitionId The validated competition ID.
 * @param {{ divisionId?: string }} [query] Only this division's standings.
 * @returns {Promise<object>} The leaderboard (see present).
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, or 400 VALIDATION_ERROR for a division of another
 *   competition.
 */
export async function getManagedLeaderboard(gyms, competitionId, { divisionId } = {}) {
  const competition = await findManagedCompetition(gyms, competitionId, COMPETITION_FIELDS);
  await checkDivision(competition, divisionId);
  return present(await calculate(competition), LEADERBOARD_AUDIENCE.MANAGE, { divisionId });
}

/**
 * The leaderboard of a competition the Climber registered for (US-020 criterion 4, US-032), with
 * their own place. A Climber who didn't register can still see it when it's public.
 *
 * @param {string} climberId The Climber, from the access token.
 * @param {string} competitionId The validated competition ID.
 * @param {{ divisionId?: string }} [query] Only this division's standings.
 * @returns {Promise<object>} The leaderboard, with myEntry.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND, 404 REGISTRATION_NOT_FOUND when the Climber isn't
 *   registered and it isn't public, or 400 VALIDATION_ERROR for another competition's division.
 */
export async function getClimberLeaderboard(climberId, competitionId, { divisionId } = {}) {
  const competition = await Competition.findById(competitionId, COMPETITION_FIELDS).lean();
  if (!competition || competition.status === COMPETITION_STATUS.DRAFT) throw competitionNotFound();

  const registered = await Registration.exists({ competitionId: competition._id, climberId });
  if (!registered) {
    try {
      await checkPublicAccess(competition);
    } catch (error) {
      // A competition the Climber could find, but isn't registered for, says so.
      throw error.code === "LEADERBOARD_NOT_PUBLIC" ? notRegistered() : error;
    }
  }
  await checkDivision(competition, divisionId);
  return present(await calculate(competition), LEADERBOARD_AUDIENCE.CLIMBER, {
    climberId: String(climberId),
    divisionId,
  });
}

/**
 * A competition's public leaderboard, for anyone, logged in or not (US-020 criteria 5 and 6). It's
 * there only when the Gym Admin turned public access on, the competition is PUBLISHED, and its gym
 * is ACTIVE. It's read-only and shows names and totals only.
 *
 * @param {string} competitionId The validated competition ID.
 * @param {{ divisionId?: string }} [query] Only this division's standings.
 * @returns {Promise<object>} The leaderboard.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND for a draft, a missing competition, or one whose gym
 *   isn't active; 403 LEADERBOARD_NOT_PUBLIC when public access is off.
 */
export async function getPublicLeaderboard(competitionId, { divisionId } = {}) {
  const competition = await Competition.findById(competitionId, COMPETITION_FIELDS).lean();
  if (!competition) throw competitionNotFound();
  await checkPublicAccess(competition);
  await checkDivision(competition, divisionId);
  return present(await calculate(competition), LEADERBOARD_AUDIENCE.PUBLIC, { divisionId });
}

// ---------- live updates ----------

/**
 * What a live connection may see of a competition's leaderboard, decided the same way as the
 * requests above: a Gym Admin of its gym gets the MANAGE view, a registered Climber the CLIMBER
 * view, and anyone else the PUBLIC view, only when it's public.
 *
 * @param {{ userId: string, role: string } | null} viewer The logged-in user, or null for a Visitor.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<{ audience: string, climberId?: string }>}
 * @throws {AppError} As getPublicLeaderboard, when the viewer gets no other view.
 */
export async function leaderboardAccess(viewer, competitionId) {
  const competition = await Competition.findById(competitionId, COMPETITION_FIELDS).lean();
  if (!competition) throw competitionNotFound();

  if (viewer?.role === ROLES.GYM_ADMIN) {
    const [account, gym] = await Promise.all([
      User.exists({ _id: viewer.userId, role: ROLES.GYM_ADMIN, isActive: true }),
      Gym.exists({ _id: competition.gymId, adminIds: viewer.userId, status: ACTIVE_GYM }),
    ]);
    if (account && gym) return { audience: LEADERBOARD_AUDIENCE.MANAGE };
  }

  if (viewer?.role === ROLES.CLIMBER && competition.status !== COMPETITION_STATUS.DRAFT) {
    const registered = await Registration.exists({
      competitionId: competition._id,
      climberId: viewer.userId,
    });
    if (registered) return { audience: LEADERBOARD_AUDIENCE.CLIMBER, climberId: viewer.userId };
  }

  await checkPublicAccess(competition);
  return { audience: LEADERBOARD_AUDIENCE.PUBLIC };
}