import mongoose from "mongoose";
import {
  COMPETITION_STATUS,
  REGISTRATION_RECORD_STATUS,
  REGISTRATION_STATUS,
} from "../constants/competitions.js";
import {
  DISCOVERY_DISTANCE_CHOICES_KM,
  DISCOVERY_MAP_PIN_LIMIT,
  DISCOVERY_MAX_RADIUS_KM,
  DISCOVERY_NEAR_SAVED,
  DISCOVERY_ORDER_LIMIT,
  DISCOVERY_REGISTRATION,
  DISCOVERY_REGISTRATION_OPTIONS,
  DISCOVERY_SEARCH_MAX_WORDS,
  DISCOVERY_SORT,
  DISCOVERY_SORT_OPTIONS,
} from "../constants/discovery.js";
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
import { describeScoring, savedScoring } from "../utils/scoringSettings.js";
import { competitionNotFound } from "./competitionAccess.js";

/** Only competitions of ACTIVE gyms are shown to Climbers (US-005: deactivating a gym hides them). */
const ACTIVE_GYM = "ACTIVE";

/** Compares text ignoring case, for sorting division names. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

/** What a list item or map pin needs. Nothing about who created it or how it's scored. */
const SUMMARY_FIELDS = "gymId name date location registrationStatus capacity mapPoint";

/** What the Event Details page needs (US-025 criterion 5, read by US-028 later). */
const DETAIL_FIELDS = `${SUMMARY_FIELDS} description scoring.deductionPercent scoring.maxAttempts`;

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
  return Gym.find({ status: ACTIVE_GYM }, "name location mapPoint").sort({ name: 1 }).lean();
}

/**
 * The IDs of the ACTIVE gyms whose map pin is within the distance filter of the origin, or null
 * when there's no distance filter. A competition is held at its gym, so distances are measured
 * from the gym's pin, and a gym without a pin is never within any distance.
 */
async function gymIdsNear(origin, radiusKm) {
  if (!origin || radiusKm === undefined) return null;
  const gyms = await Gym.find(
    {
      status: ACTIVE_GYM,
      // Built by the server from the validated query, so the operator is trusted past
      // sanitizeFilter.
      mapPoint: mongoose.trusted({
        $geoWithin: {
          $centerSphere: [[origin.lng, origin.lat], radiusKm / EARTH_RADIUS_KM],
        },
      }),
    },
    "_id",
  ).lean();
  return new Set(gyms.map((gym) => String(gym._id)));
}

/** What each field that needs the saved location says when the Climber has none. */
const NO_SAVED_LOCATION = Object.freeze({
  near: "Your account doesn't have a saved location. Choose another starting point.",
  radiusKm: "Choose a starting point to search by distance.",
  sort: "Choose a starting point to sort by distance.",
});

/**
 * The starting point distances are measured from: the point the Climber sent, such as where they
 * are or a place they searched for, or else the location they saved at sign-up, when they asked
 * for it with near=saved or when a distance filter or the closest-first order needs a point. The
 * point is only used for this answer. It's never saved or logged.
 *
 * @returns {Promise<{ lat: number, lng: number } | null>} The point, or null when none is needed.
 * @throws {AppError} 400 VALIDATION_ERROR when the saved location is needed and there isn't one.
 */
async function originFor(userId, { lat, lng, near, radiusKm, sort }) {
  if (lat !== undefined && lng !== undefined) return { lat, lng };
  let needs = null;
  if (near === DISCOVERY_NEAR_SAVED) needs = "near";
  else if (radiusKm !== undefined) needs = "radiusKm";
  else if (sort === DISCOVERY_SORT.CLOSEST) needs = "sort";
  if (!needs) return null;

  const user = await User.findById(userId, "location").lean();
  const saved = fromGeoPoint(user?.location);
  if (!saved) {
    throw new AppError(400, "VALIDATION_ERROR", "Check the fields and try again.", {
      [needs]: NO_SAVED_LOCATION[needs],
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
 * and other gyms' unpublished plans never match, whatever the query says. With a distance filter,
 * only the competitions of the gyms in nearGymIds match.
 */
function discoveryFilter(gyms, query, nearGymIds) {
  let gymIds = gyms.map((gym) => gym._id);
  if (query.gymId) gymIds = gymIds.filter((id) => String(id) === query.gymId);
  if (nearGymIds) gymIds = gymIds.filter((id) => nearGymIds.has(String(id)));

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
  return filter;
}

/**
 * Builds the competition filter for the validated query. With a distance filter, it first finds
 * the gyms within it.
 *
 * @returns {Promise<{ gyms: object[], origin: { lat: number, lng: number } | null, filter: object }>}
 *   The active gyms, the point distances are measured from, and the competition filter.
 */
async function discoveryQuery(userId, query) {
  const [gyms, origin] = await Promise.all([activeGyms(), originFor(userId, query)]);
  const nearGymIds = await gymIdsNear(origin, query.radiusKm);
  return { gyms, origin, filter: discoveryFilter(gyms, query, nearGymIds) };
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
 * Where a competition is on the map: its gym's pin, since it's held at its gym, or, for a gym
 * without one, the competition's own pin.
 */
function pinOf(competition, gym) {
  return fromGeoPoint(gym?.mapPoint) ?? fromGeoPoint(competition.mapPoint);
}

/** How many Climbers have a CONFIRMED registration, the only ones that count (US-028). */
function joinedOf(competition, counts) {
  return counts.get(String(competition._id)) ?? 0;
}

function spacesLeftOf(competition, counts) {
  return Math.max(0, competition.capacity - joinedOf(competition, counts));
}

/**
 * Shapes a competition for the List View and the Map View: name, gym, date, and location (US-026
 * criteria 2 and 3), registration, Climbers joined and spaces left, its map pin, and, when there's
 * a starting point, its distance, which is to its gym's pin.
 */
function presentSummary(competition, gymsById, counts, origin) {
  const gym = gymsById.get(String(competition.gymId));
  const gymPin = fromGeoPoint(gym?.mapPoint);
  const coordinates = pinOf(competition, gym);
  const spacesLeft = spacesLeftOf(competition, counts);
  return {
    _id: competition._id,
    name: competition.name,
    date: calendarDate(competition.date),
    location: competition.location,
    gym: gym ? { _id: gym._id, name: gym.name } : null,
    registrationStatus: competition.registrationStatus,
    capacity: competition.capacity,
    joined: joinedOf(competition, counts),
    spacesLeft,
    full: spacesLeft === 0,
    coordinates,
    ...(origin ? { distanceKm: gymPin ? distanceKm(origin, gymPin) : null } : {}),
  };
}

function gymsByIdOf(gyms) {
  return new Map(gyms.map((gym) => [String(gym._id), gym]));
}

/** Soonest first, then by name and ID, as the database sorts the List View by default. */
function soonestFirst(a, b) {
  if (a.date - b.date !== 0) return a.date - b.date;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return String(a._id) < String(b._id) ? -1 : 1;
}

/**
 * A competition's place in the random order, from the shuffle seed and its ID (FNV-1a with a
 * final mix). The same seed always gives the same order, so every page of one shuffle agrees.
 */
function shuffleKey(seed, id) {
  let hash = 2166136261;
  for (const character of `${seed}:${id}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** The seed of the random order when the page sends none: the same all day in Toronto. */
function dailySeed() {
  return Number(torontoToday().replaceAll("-", ""));
}

/**
 * What the chosen order compares competitions by, smallest first. Closest first goes by the
 * distance to the gym's pin, the one shown, and puts competitions of gyms without a pin last.
 */
function orderKey(sort, { gymsById, counts, origin, seed }) {
  switch (sort) {
    case DISCOVERY_SORT.CLOSEST:
      return (competition) => {
        const pin = fromGeoPoint(gymsById.get(String(competition.gymId))?.mapPoint);
        return pin ? distanceKm(origin, pin) : Number.POSITIVE_INFINITY;
      };
    case DISCOVERY_SORT.MOST_JOINED:
      return (competition) => -joinedOf(competition, counts);
    case DISCOVERY_SORT.MOST_SPACES:
      return (competition) => -spacesLeftOf(competition, counts);
    case DISCOVERY_SORT.RANDOM:
      return (competition) => shuffleKey(seed, competition._id);
    default:
      return () => 0;
  }
}

/** Puts competitions in the chosen order, with soonest first deciding ties. */
function inOrder(competitions, sort, context) {
  const keyOf = orderKey(sort, context);
  return competitions
    .map((competition) => ({ competition, key: keyOf(competition) }))
    .sort((a, b) => {
      const byKey = a.key - b.key;
      return byKey !== 0 && !Number.isNaN(byKey)
        ? byKey
        : soonestFirst(a.competition, b.competition);
    })
    .map(({ competition }) => competition);
}

/**
 * The List View (US-025 criteria 1 to 3 and 6, US-026): available upcoming competitions that match
 * the search and filters, one page at a time, in the chosen order (US-026 criterion 6). Soonest
 * first is sorted by the database. The other orders rank the matching competitions here, up to
 * the DISCOVERY_ORDER_LIMIT soonest, which covers every upcoming competition at TopSend's gyms:
 * closest first, most joined (CONFIRMED registrations), most spaces left, or random, the same for
 * the same seed. Ties go soonest first, and total counts the ranked competitions, so every page
 * it promises has them. A distance filter keeps the competitions whose gym's pin is within it, so
 * a gym without a pin leaves its competitions out.
 *
 * @param {string} userId The Climber, from the access token.
 * @param {{ q?: string, gymId?: string, from?: Date, to?: Date, registration: string, lat?: number, lng?: number, near?: string, radiusKm?: number, sort?: string, seed?: number, page: number, limit: number }} query
 *   The validated query.
 * @returns {Promise<{ competitions: object[], total: number, page: number, limit: number }>}
 * @throws {AppError} 400 VALIDATION_ERROR when a starting point is needed and there's none.
 */
export async function listCompetitions(userId, query) {
  const { gyms, origin, filter } = await discoveryQuery(userId, query);
  const { page, limit } = query;
  const sort = query.sort ?? DISCOVERY_SORT.SOONEST;
  const gymsById = gymsByIdOf(gyms);
  const present = (competitions, counts) =>
    competitions.map((competition) =>
      presentSummary(competition, gymsById, counts, origin),
    );

  if (sort === DISCOVERY_SORT.SOONEST) {
    const [competitions, total] = await Promise.all([
      Competition.find(filter, SUMMARY_FIELDS)
        .sort({ date: 1, name: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Competition.countDocuments(filter),
    ]);
    const counts = await confirmedCounts(competitions);
    return { competitions: present(competitions, counts), total, page, limit };
  }

  const matching = await Competition.find(filter, SUMMARY_FIELDS)
    .sort({ date: 1, name: 1, _id: 1 })
    .limit(DISCOVERY_ORDER_LIMIT)
    .lean();
  const byRegistrations =
    sort === DISCOVERY_SORT.MOST_JOINED || sort === DISCOVERY_SORT.MOST_SPACES;
  const allCounts = byRegistrations ? await confirmedCounts(matching) : null;
  const ordered = inOrder(matching, sort, {
    gymsById,
    counts: allCounts,
    origin,
    seed: query.seed ?? dailySeed(),
  });
  const competitions = ordered.slice((page - 1) * limit, page * limit);
  const counts = allCounts ?? (await confirmedCounts(competitions));
  return { competitions: present(competitions, counts), total: matching.length, page, limit };
}

/**
 * Pins each competition without a saved pin where its address is, when findPoints can place it.
 * The point is only used for this answer, never saved. pending counts the competitions whose
 * address findPoints didn't look up this time, which a later request looks up.
 *
 * @returns {Promise<{ located: object[], pending: number }>} The competitions and that count.
 */
async function withAddressPoints(competitions, gymsById, findPoints) {
  const unpinned = new Set(
    competitions.filter(
      (competition) =>
        !pinOf(competition, gymsById.get(String(competition.gymId))) &&
        competition.location,
    ),
  );
  if (!findPoints || unpinned.size === 0) return { located: competitions, pending: 0 };

  const answers = await findPoints([...unpinned].map((competition) => competition.location));
  let pending = 0;
  const located = competitions.map((competition) => {
    if (!unpinned.has(competition)) return competition;
    if (!answers.has(competition.location)) {
      pending += 1;
      return competition;
    }
    const point = answers.get(competition.location);
    return point ? { ...competition, mapPoint: toGeoPoint(point) } : competition;
  });
  return { located, pending };
}

/**
 * The Map View (US-025 criterion 4, US-027): the same competitions as the List View, as pins. A
 * competition is pinned at its gym's pin, or, for a gym without one, at a pin saved with the
 * competition, or else where its address is, when findPoints can place it. One that still has no
 * pin can't be drawn, so it's counted instead, and the List View still shows it (NR-003: the List
 * View never depends on the map). The starting point comes back too, so the map can show it and
 * the chosen distance around it (US-027 criterion 7).
 *
 * @param {string} userId The Climber, from the access token.
 * @param {object} query The validated query, as for listCompetitions but without order or paging.
 * @param {((addresses: string[]) => Promise<Map<string, { lat: number, lng: number } | null>>) | null} [findPoints]
 *   Finds where addresses are, from createAddressPoints, or null to use saved pins only.
 * @returns {Promise<{ pins: object[], total: number, unmapped: number, pending: number, truncated: boolean, origin: { lat: number, lng: number } | null }>}
 *   total counts every matching competition; unmapped counts the loaded ones without a map
 *   location; pending counts the loaded ones whose address wasn't looked up yet, which a refresh
 *   can pin; truncated is true when more matched than the DISCOVERY_MAP_PIN_LIMIT loaded; origin
 *   is the starting point, or null when there's none.
 * @throws {AppError} 400 VALIDATION_ERROR when a starting point is needed and there's none.
 */
export async function competitionMap(userId, query, findPoints = null) {
  const { gyms, origin, filter } = await discoveryQuery(userId, query);

  const [competitions, total] = await Promise.all([
    Competition.find(filter, SUMMARY_FIELDS)
      .sort({ date: 1, name: 1, _id: 1 })
      .limit(DISCOVERY_MAP_PIN_LIMIT)
      .lean(),
    Competition.countDocuments(filter),
  ]);

  const gymsById = gymsByIdOf(gyms);
  const { located, pending } = await withAddressPoints(competitions, gymsById, findPoints);
  const pins = located.filter((competition) =>
    pinOf(competition, gymsById.get(String(competition.gymId))),
  );
  const counts = await confirmedCounts(pins);
  return {
    pins: pins.map((competition) =>
      presentSummary(competition, gymsById, counts, origin),
    ),
    total,
    unmapped: competitions.length - pins.length - pending,
    pending,
    truncated: total > competitions.length,
    origin,
  };
}

/**
 * The choices for the Discover page's filters and order (US-025 criteria 3 and 6, US-026 criterion
 * 6): gyms that have available competitions, the registration filter, the orders, the distances
 * offered and the widest one, and whether the Climber saved a location to start from.
 *
 * @param {string} userId The Climber, from the access token.
 * @returns {Promise<{ gyms: object[], registration: readonly object[], sorts: readonly object[], distanceChoicesKm: readonly number[], maxRadiusKm: number, hasSavedLocation: boolean }>}
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
    sorts: DISCOVERY_SORT_OPTIONS,
    distanceChoicesKm: DISCOVERY_DISTANCE_CHOICES_KM,
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
    "name location mapPoint",
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
  const scoring = savedScoring(competition.scoring);
  const division = registration?.divisionId;

  return {
    _id: competition._id,
    name: competition.name,
    date: calendarDate(competition.date),
    location: competition.location,
    description: competition.description ?? "",
    gym: { _id: gym._id, name: gym.name, location: gym.location },
    coordinates: pinOf(competition, gym),
    upcoming,
    registrationStatus: competition.registrationStatus,
    capacity: competition.capacity,
    spacesLeft,
    full: spacesLeft === 0,
    divisions: divisions.map(({ _id, name }) => ({ _id, name })),
    scoringFormat: scoring ? { label: describeScoring(scoring) } : null,
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
