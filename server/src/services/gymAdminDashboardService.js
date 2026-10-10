import mongoose from "mongoose";
import {
  COMPETITION_PERIOD,
  COMPETITION_STATUS,
  DASHBOARD_UPCOMING_LIMIT,
} from "../constants/competitions.js";
import { Competition } from "../models/Competition.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";

/** Fields a competition list needs; the full record is only sent for one competition. */
const LIST_FIELDS = "gymId name date location status registrationStatus capacity";

/**
 * The management tools a Gym Admin can open from a competition (US-011 criterion 4). Each key
 * names the story that builds it, so the client knows which screen to link to.
 */
const MANAGEMENT_TOOLS = Object.freeze([
  { key: "details", label: "Competition details", story: "US-012" },
  { key: "divisions", label: "Divisions and climbers", story: "US-014" },
  { key: "routes", label: "Boulder problems", story: "US-016" },
  { key: "scoring", label: "Scoring format", story: "US-018" },
]);

function competitionNotFound() {
  // The same 404 answers "doesn't exist" and "belongs to another gym", so a Gym Admin
  // can't find out which competitions other gyms have (criterion 5).
  return new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
}

/** Today in Toronto, as the midnight-UTC Date that competition dates are stored as. */
function today() {
  return parseCalendarDate(torontoToday()).date;
}

/**
 * The filter that keeps a query inside the user's gyms. The server builds these operators
 * itself, so they're marked trusted for Mongoose's sanitizeFilter, which would otherwise strip
 * them as if they came from a request.
 */
function inGyms(gymIds) {
  return { gymId: mongoose.trusted({ $in: gymIds }) };
}

function upcomingFilter(gymIds) {
  return {
    ...inGyms(gymIds),
    date: mongoose.trusted({ $gte: today() }),
    status: mongoose.trusted({ $ne: COMPETITION_STATUS.CANCELLED }),
  };
}

function pastFilter(gymIds) {
  return { ...inGyms(gymIds), date: mongoose.trusted({ $lt: today() }) };
}

/**
 * Shapes a competition for the client: the date as YYYY-MM-DD, so browsers in other time zones
 * don't show the day before, and the gym's name next to its ID.
 */
function present(competition, gymsById) {
  const gym = gymsById.get(String(competition.gymId));
  return {
    ...competition,
    date: competition.date.toISOString().slice(0, 10),
    gym: gym ? { _id: gym._id, name: gym.name } : null,
  };
}

function gymsByIdOf(gyms) {
  return new Map(gyms.map((gym) => [String(gym._id), gym]));
}

/**
 * Builds the Gym Admin Dashboard (US-011): the user's gyms, counts of their competitions, and
 * the next few upcoming ones.
 *
 * @param {{ _id: unknown, name: string, location: string }[]} gyms The active gyms the user
 *   administers, from requireGymAdmin.
 * @returns {Promise<{ gyms: object[], counts: { upcoming: number, past: number, drafts: number }, upcoming: object[] }>}
 */
export async function getDashboard(gyms) {
  const gymIds = gyms.map((gym) => gym._id);
  const [upcomingCount, pastCount, draftCount, upcoming] = await Promise.all([
    Competition.countDocuments(upcomingFilter(gymIds)),
    Competition.countDocuments(pastFilter(gymIds)),
    Competition.countDocuments({
      ...upcomingFilter(gymIds),
      status: COMPETITION_STATUS.DRAFT,
    }),
    Competition.find(upcomingFilter(gymIds), LIST_FIELDS)
      .sort({ date: 1, name: 1 })
      .limit(DASHBOARD_UPCOMING_LIMIT)
      .lean(),
  ]);

  const gymsById = gymsByIdOf(gyms);
  return {
    gyms,
    counts: { upcoming: upcomingCount, past: pastCount, drafts: draftCount },
    upcoming: upcoming.map((competition) => present(competition, gymsById)),
  };
}

/**
 * Lists the competitions of the user's gyms, one page at a time (US-011 criteria 1 and 2).
 * Upcoming ones come soonest first; past ones most recent first.
 *
 * @param {{ _id: unknown, name: string }[]} gyms The active gyms the user administers.
 * @param {{ period: "upcoming" | "past" | "all", gymId?: string, page: number, limit: number }} query
 *   The validated query.
 * @returns {Promise<{ competitions: object[], total: number, page: number, limit: number }>}
 * @throws {AppError} 404 GYM_NOT_FOUND when gymId isn't one of the user's gyms.
 */
export async function listCompetitions(gyms, { period, gymId, page, limit }) {
  let gymIds = gyms.map((gym) => gym._id);
  if (gymId) {
    gymIds = gymIds.filter((id) => String(id) === gymId);
    if (gymIds.length === 0) {
      throw new AppError(404, "GYM_NOT_FOUND", "Gym not found.");
    }
  }

  const filters = {
    [COMPETITION_PERIOD.UPCOMING]: upcomingFilter(gymIds),
    [COMPETITION_PERIOD.PAST]: pastFilter(gymIds),
    [COMPETITION_PERIOD.ALL]: inGyms(gymIds),
  };
  const filter = filters[period];
  const sort =
    period === COMPETITION_PERIOD.UPCOMING
      ? { date: 1, name: 1 }
      : { date: -1, name: 1 };

  const [competitions, total] = await Promise.all([
    Competition.find(filter, LIST_FIELDS)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Competition.countDocuments(filter),
  ]);

  const gymsById = gymsByIdOf(gyms);
  return {
    competitions: competitions.map((c) => present(c, gymsById)),
    total,
    page,
    limit,
  };
}

/**
 * Opens one competition to manage (US-011 criteria 3 and 4), with the tools available for it.
 * The query itself requires the competition's gym to be one of the user's, so a competition of
 * another gym is never loaded.
 *
 * @param {{ _id: unknown, name: string }[]} gyms The active gyms the user administers.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<object>} The competition, its gym, and its management tools.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND when it doesn't exist or isn't the user's gym's.
 */
export async function getCompetition(gyms, competitionId) {
  const competition = await Competition.findOne({
    _id: competitionId,
    ...inGyms(gyms.map((gym) => gym._id)),
  }).lean();
  if (!competition) throw competitionNotFound();

  return {
    ...present(competition, gymsByIdOf(gyms)),
    tools: MANAGEMENT_TOOLS,
  };
}
