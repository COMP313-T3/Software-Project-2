import mongoose from "mongoose";
import {
  COMPETITION_STATUS,
  REGISTRATION_RECORD_STATUS,
  REGISTRATION_STATUS,
} from "../constants/competitions.js";
import {
  DISCOVERY_MAP_PIN_LIMIT,
  DISCOVERY_MAX_RADIUS_KM,
  DISCOVERY_REGISTRATION,
  DISCOVERY_REGISTRATION_OPTIONS,
  DISCOVERY_SEARCH_MAX_WORDS,
} from "../constants/discovery.js";
import { SCORING_FORMAT_OPTIONS } from "../constants/scoring.js";
import { Competition } from "../models/Competition.js";
import { Division } from "../models/Division.js";
import { Gym } from "../models/Gym.js";
import { Registration } from "../models/Registration.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";
import {
  distanceKm,
  EARTH_RADIUS_KM,
  fromGeoPoint,
  toGeoPoint,
} from "../utils/geoPoints.js";
import { competitionNotFound } from "./competitionAccess.js";

/** Only competitions of ACTIVE gyms are shown to Climbers (US-005: deactivating a gym hides them). */
const ACTIVE_GYM = "ACTIVE";

/** Compares text ignoring case, for sorting division names. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** What a list item or map pin needs. Nothing about who created it or how it's scored. */
const SUMMARY_FIELDS = "gymId name date location registrationStatus capacity mapPoint";

/** What the Event Details page needs (US-025 criterion 5, read by US-028 later). */
const DETAIL_FIELDS = `${SUMMARY_FIELDS} description scoring.format`;

/** Today in Toronto, as the midnight-UTC Date that competition dates are stored as. */
function today() {
  return parseCalendarDate(torontoToday()).date;
}

/** The YYYY-MM-DD form of a stored competition date, so other time zones don't shift the day. */
function calendarDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Escapes text so it's searched for literally, never run as a regular expression. */
function literal(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activeGyms() {
  return Gym.find({ status: ACTIVE_GYM }, "name location").sort({ name: 1 }).lean();
}

/**
 * The point distances are measured from: the one the Climber chose on the map, or, for a distance
 * filter without one, the location they saved at sign-up.
 *
 * @returns {Promise<{ lat: number, lng: number } | null>} The point, or null when none is needed.
 * @throws {AppError} 400 VALIDATION_ERROR when a distance filter has no point to measure from.
 */
async function originFor(userId, { lat, lng, radiusKm }) {
  if (lat !== undefined && lng !== undefined) return { lat, lng };
  if (radiusKm === undefined) return null;

  const user = await User.findById(userId, "location").lean();
  const saved = fromGeoPoint(user?.location);
  if (!saved) {
    throw new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
      radiusKm: "Choose a point on the map to search by distance.",
    });
  }
  return saved;
}

/**
 * The search text as a filter. Every word must appear in the competition's name, its location, or
 * its gym's name, ignoring case, so "boulder toronto" finds "Fall Boulder Bash" at a Toronto gym.
 */
function searchFilter(q, gyms) {
  const words = q.split(/\s+/).filter(Boolean).slice(0, DISCOVERY_SEARCH_MAX_WORDS);
  return words.map((word) => {
    const pattern = new RegExp(literal(word), "i");
    const gymIds = gyms.filter((gym) => pattern.test(gym.name)).map((gym) => gym._id);
    // Built by the server, with the text escaped, so these operators are trusted past
    // sanitizeFilter.
    const text = () => mongoose.trusted({ $regex: literal(word), $options: "i" });
    return {
      $or: [
        { name: text() },
        { location: text() },
        { gymId: mongoose.trusted({ $in: gymIds }) },
      ],
    };
  });
}

/**
 * The MongoDB filter for "available upcoming competitions" (US-025 criterion 1) narrowed by the
 * validated search and filters (criteria 2 and 3). A competition is available when it's PUBLISHED,
 * its date is today or later in Toronto, and its gym is ACTIVE. Drafts, cancelled competitions,
 * and other gyms' unpublished plans never match, whatever the query says.
 */
function discoveryFilter(gyms, query, origin) {
  let gymIds = gyms.map((gym) => gym._id);
  if (query.gymId) gymIds = gymIds.filter((id) => String(id) === query.gymId);

  const earliest = today();
  const from = query.from && query.from > earliest ? query.from : earliest;
  const filter = {
    status: COMPETITION_STATUS.PUBLISHED,
    gymId: mongoose.trusted({ $in: gymIds }),
    date: mongoose.trusted(query.to ? { $gte: from, $lte: query.to } : { $gte: from }),
  };
  if (query.registration === DISCOVERY_REGISTRATION.OPEN) {
    filter.registrationStatus = REGISTRATION_STATUS.OPEN;
  }
  if (query.q) filter.$and = searchFilter(query.q, gyms);
  if (origin && query.radiusKm !== undefined) {
    filter.mapPoint = mongoose.trusted({
      $geoWithin: {
        $centerSphere: [[origin.lng, origin.lat], query.radiusKm / EARTH_RADIUS_KM],
      },
    });
  }
  return filter;
}

/** How many CONFIRMED registrations each competition has, keyed by competition ID. */
async function confirmedCounts(competitions) {
  if (competitions.length === 0) return new Map();
  // Aggregations don't convert IDs, so this uses the ObjectIds just loaded.
  const counts = await Registration.aggregate([
    {
      $match: {
        competitionId: { $in: competitions.map((competition) => competition._id) },
        status: REGISTRATION_RECORD_STATUS.CONFIRMED,
      },
    },
    { $group: { _id: "$competitionId", count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((entry) => [String(entry._id), entry.count]));
}

/**
 * Shapes a competition for the List View and the Map View: name, gym, date, and location (US-026
 * criteria 2 and 3), registration and spaces left, its map pin, and its distance when a point was
 * given.
 */
function presentSummary(competition, gymsById, counts, origin) {
  const gym = gymsById.get(String(competition.gymId));
  const coordinates = fromGeoPoint(competition.mapPoint);
  const spacesLeft = Math.max(
    0,
    competition.capacity - (counts.get(String(competition._id)) ?? 0),
  );
  return {
    _id: competition._id,
    name: competition.name,
    date: calendarDate(competition.date),
    location: competition.location,
    gym: gym ? { _id: gym._id, name: gym.name } : null,
    registrationStatus: competition.registrationStatus,
    capacity: competition.capacity,
    spacesLeft,
    full: spacesLeft === 0,
    coordinates,
    ...(origin ? { distanceKm: coordinates ? distanceKm(origin, coordinates) : null } : {}),
  };
}

function gymsByIdOf(gyms) {
  return new Map(gyms.map((gym) => [String(gym._id), gym]));
}

/**
 * The List View (US-025 criteria 1 to 3, US-026): available upcoming competitions that match the
 * search and filters, soonest first, one page at a time.
 *
 * @param {string} userId The Climber, from the access token.
 * @param {{ q?: string, gymId?: string, from?: Date, to?: Date, registration: string, lat?: number, lng?: number, radiusKm?: number, page: number, limit: number }} query
 *   The validated query.
 * @returns {Promise<{ competitions: object[], total: number, page: number, limit: number }>}
 * @throws {AppError} 400 VALIDATION_ERROR when a distance filter has no point to measure from.
 */
export async function listCompetitions(userId, query) {
  const [gyms, origin] = await Promise.all([activeGyms(), originFor(userId, query)]);
  const filter = discoveryFilter(gyms, query, origin);
  const { page, limit } = query;

  const [competitions, total] = await Promise.all([
    Competition.find(filter, SUMMARY_FIELDS)
      .sort({ date: 1, name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Competition.countDocuments(filter),
  ]);

  const counts = await confirmedCounts(competitions);
  const gymsById = gymsByIdOf(gyms);
  return {
    competitions: competitions.map((competition) =>
      presentSummary(competition, gymsById, counts, origin),
    ),
    total,
    page,
    limit,
  };
}

/**
 * Pins each competition without a valid saved pin where its address is, when findPoints can
 * place it. The point is only used for this answer, never saved.
 */
async function withAddressPoints(competitions, findPoints) {
  const unpinned = competitions.filter(
    (competition) => !fromGeoPoint(competition.mapPoint) && competition.location,
  );
  if (!findPoints || unpinned.length === 0) return competitions;

  const found = await findPoints(unpinned.map((competition) => competition.location));
  return competitions.map((competition) => {
    const point = !fromGeoPoint(competition.mapPoint) && found.get(competition.location);
    return point ? { ...competition, mapPoint: toGeoPoint(point) } : competition;
  });
}

/**
 * The Map View (US-025 criterion 4, US-027): the same competitions as the List View, as pins. A
 * competition without a saved map pin is pinned where its address is, when findPoints can place
 * it. One that still has no pin can't be drawn, so it's counted in unmapped instead, and the
 * List View still shows it (NR-003: the List View never depends on the map).
 *
 * @param {string} userId The Climber, from the access token.
 * @param {object} query The validated query, as for listCompetitions but without paging.
 * @param {((addresses: string[]) => Promise<Map<string, { lat: number, lng: number }>>) | null} [findPoints]
 *   Finds where addresses are, from createAddressPoints, or null to use saved pins only.
 * @returns {Promise<{ pins: object[], total: number, unmapped: number, truncated: boolean }>}
 *   total counts every matching competition; unmapped counts the loaded ones without a pin;
 *   truncated is true when more matched than the DISCOVERY_MAP_PIN_LIMIT loaded.
 * @throws {AppError} 400 VALIDATION_ERROR when a distance filter has no point to measure from.
 */
export async function competitionMap(userId, query, findPoints = null) {
  const [gyms, origin] = await Promise.all([activeGyms(), originFor(userId, query)]);
  const filter = discoveryFilter(gyms, query, origin);

  const [competitions, total] = await Promise.all([
    Competition.find(filter, SUMMARY_FIELDS)
      .sort({ date: 1, name: 1, _id: 1 })
      .limit(DISCOVERY_MAP_PIN_LIMIT)
      .lean(),
    Competition.countDocuments(filter),
  ]);

  const located = await withAddressPoints(competitions, findPoints);
  const pins = located.filter((competition) => fromGeoPoint(competition.mapPoint));
  const counts = await confirmedCounts(pins);
  const gymsById = gymsByIdOf(gyms);
  return {
    pins: pins.map((competition) =>
      presentSummary(competition, gymsById, counts, origin),
    ),
    total,
    unmapped: competitions.length - pins.length,
    truncated: total > competitions.length,
  };
}

/**
 * The choices for the Discover page's filters (US-025 criterion 3): gyms that have available
 * competitions, the registration filter, the widest distance, and whether the Climber saved a
 * location to measure distances from.
 *
 * @param {string} userId The Climber, from the access token.
 * @returns {Promise<{ gyms: object[], registration: readonly object[], maxRadiusKm: number, hasSavedLocation: boolean }>}
 */
export async function discoveryOptions(userId) {
  const gyms = await activeGyms();
  const [counts, user] = await Promise.all([
    gyms.length === 0
      ? []
      : Competition.aggregate([
          {
            $match: {
              status: COMPETITION_STATUS.PUBLISHED,
              date: { $gte: today() },
              gymId: { $in: gyms.map((gym) => gym._id) },
            },
          },
          { $group: { _id: "$gymId", count: { $sum: 1 } } },
        ]),
    User.findById(userId, "location").lean(),
  ]);

  const countByGym = new Map(counts.map((entry) => [String(entry._id), entry.count]));
  return {
    gyms: gyms
      .filter((gym) => countByGym.has(String(gym._id)))
      .map((gym) => ({
        _id: gym._id,
        name: gym.name,
        location: gym.location,
        competitionCount: countByGym.get(String(gym._id)),
      })),
    registration: DISCOVERY_REGISTRATION_OPTIONS,
    maxRadiusKm: DISCOVERY_MAX_RADIUS_KM,
    hasSavedLocation: fromGeoPoint(user?.location) !== null,
  };
}

/**
 * One competition, opened from the List View or a map pin (US-025 criterion 5, US-026 criterion 5,
 * US-027 criterion 6). It's found only when it's PUBLISHED and its gym is ACTIVE; a draft, a
 * cancelled competition, or one of an inactive gym answers the same 404 as one that doesn't
 * exist. A past competition still opens, marked upcoming: false, so links keep working.
 *
 * Registering is US-028; registrationAvailable only tells the page whether to offer it.
 *
 * @param {string} userId The Climber, from the access token.
 * @param {string} competitionId The validated competition ID.
 * @returns {Promise<object>} The event details, its divisions, spaces left, and the Climber's own
 *   registration, if any.
 * @throws {AppError} 404 COMPETITION_NOT_FOUND.
 */
export async function getCompetitionDetails(userId, competitionId) {
  const competition = await Competition.findOne(
    { _id: competitionId, status: COMPETITION_STATUS.PUBLISHED },
    DETAIL_FIELDS,
  ).lean();
  if (!competition) throw competitionNotFound();

  const gym = await Gym.findOne(
    { _id: competition.gymId, status: ACTIVE_GYM },
    "name location",
  ).lean();
  if (!gym) throw competitionNotFound();

  const [divisions, confirmed, registration] = await Promise.all([
    Division.find({ competitionId: competition._id }, "name")
      .collation(CASE_INSENSITIVE)
      .sort({ name: 1 })
      .lean(),
    Registration.countDocuments({
      competitionId: competition._id,
      status: REGISTRATION_RECORD_STATUS.CONFIRMED,
    }),
    Registration.findOne(
      { competitionId: competition._id, climberId: userId },
      "status divisionId registeredAt",
    )
      .populate("divisionId", "name")
      .lean(),
  ]);

  const upcoming = competition.date >= today();
  const spacesLeft = Math.max(0, competition.capacity - confirmed);
  const format = SCORING_FORMAT_OPTIONS.find(
    (option) => option.format === competition.scoring?.format,
  );
  const division = registration?.divisionId;

  return {
    _id: competition._id,
    name: competition.name,
    date: calendarDate(competition.date),
    location: competition.location,
    description: competition.description ?? "",
    gym: { _id: gym._id, name: gym.name, location: gym.location },
    coordinates: fromGeoPoint(competition.mapPoint),
    upcoming,
    registrationStatus: competition.registrationStatus,
    capacity: competition.capacity,
    spacesLeft,
    full: spacesLeft === 0,
    divisions: divisions.map(({ _id, name }) => ({ _id, name })),
    scoringFormat: format ? { format: format.format, label: format.label } : null,
    myRegistration: registration
      ? {
          status: registration.status,
          registeredAt: registration.registeredAt,
          division: division?._id ? { _id: division._id, name: division.name } : null,
        }
      : null,
    registrationAvailable:
      upcoming &&
      competition.registrationStatus === REGISTRATION_STATUS.OPEN &&
      spacesLeft > 0 &&
      divisions.length > 0 &&
      !registration,
  };
}
