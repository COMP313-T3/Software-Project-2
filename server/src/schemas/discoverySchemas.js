import { z } from "zod";
import {
  DISCOVERY_MAX_RADIUS_KM,
  DISCOVERY_REGISTRATION,
  DISCOVERY_REGISTRATION_FILTERS,
  DISCOVERY_SEARCH_MAX_LENGTH,
} from "../constants/discovery.js";
import { parseCalendarDate } from "../utils/calendarDates.js";
import { limit, objectId, page } from "./commonFields.js";

const DATE_MESSAGE = "Enter a date like 2026-11-14.";
const POINT_MESSAGE = "Choose a point on the map.";
const RADIUS_MESSAGE = `Choose a distance from 1 to ${DISCOVERY_MAX_RADIUS_KM} km.`;
const REGISTRATION_MESSAGE = `Choose a registration filter: ${DISCOVERY_REGISTRATION_FILTERS.join(", ")}.`;
const DECIMAL = /^-?\d{1,3}(\.\d{1,15})?$/;

/**
 * A filter left empty, such as ?gymId= from a cleared dropdown, counts as not chosen, so the
 * Discover page can always send every filter field.
 *
 * @param {import("zod").ZodType} schema The filter's own check.
 */
function optionalFilter(schema) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );
}

/** A YYYY-MM-DD date, which becomes the midnight-UTC Date competition dates are stored as. */
const calendarDay = z
  .string({ error: DATE_MESSAGE })
  .trim()
  .transform((value, ctx) => {
    const parsed = parseCalendarDate(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: DATE_MESSAGE });
      return z.NEVER;
    }
    return parsed.date;
  });

/** A latitude or longitude from the query string, in decimal degrees. */
function coordinate(maxDegrees) {
  return z
    .string({ error: POINT_MESSAGE })
    .trim()
    .regex(DECIMAL, { error: POINT_MESSAGE })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(-maxDegrees, { error: POINT_MESSAGE })
        .max(maxDegrees, { error: POINT_MESSAGE }),
    );
}

/**
 * The search and filters shared by the List View and the Map View (US-025 criteria 2 and 3).
 *
 * q: search text, matched against the competition name, its location, and its gym's name.
 * gymId: only one gym's competitions.
 * from, to: only competitions on or between these dates. Past dates are never shown.
 * registration: "any" (default) or "open", for competitions taking registrations now.
 * lat, lng: a point on the map; each competition then shows its distance from it.
 * radiusKm: only competitions within this distance, from lat and lng or, without them, from the
 *   location the Climber saved at sign-up.
 */
const discoveryFilters = {
  q: optionalFilter(
    z
      .string({ error: "Enter search text." })
      .trim()
      .max(DISCOVERY_SEARCH_MAX_LENGTH, {
        error: `Use ${DISCOVERY_SEARCH_MAX_LENGTH} characters or fewer.`,
      }),
  ),
  gymId: optionalFilter(objectId("gym")),
  from: optionalFilter(calendarDay),
  to: optionalFilter(calendarDay),
  registration: optionalFilter(
    z.enum(DISCOVERY_REGISTRATION_FILTERS, { error: REGISTRATION_MESSAGE }),
  ).transform((value) => value ?? DISCOVERY_REGISTRATION.ANY),
  lat: optionalFilter(coordinate(90)),
  lng: optionalFilter(coordinate(180)),
  radiusKm: optionalFilter(
    z.coerce
      .number({ error: RADIUS_MESSAGE })
      .min(1, { error: RADIUS_MESSAGE })
      .max(DISCOVERY_MAX_RADIUS_KM, { error: RADIUS_MESSAGE }),
  ),
};

/** Rules that compare two filters, so they're checked once the fields themselves are valid. */
function checkFilterPairs(query, ctx) {
  if (query.from && query.to && query.to < query.from) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "Choose an end date on or after the start date.",
    });
  }
  if ((query.lat === undefined) !== (query.lng === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: [query.lat === undefined ? "lat" : "lng"],
      message: POINT_MESSAGE,
    });
  }
}

/** Query for GET /api/competitions, the List View (US-025, US-026): the filters and paging. */
export const discoverCompetitionsQuerySchema = z
  .object({ ...discoveryFilters, page, limit })
  .superRefine(checkFilterPairs);

/** Query for GET /api/competitions/map, the Map View (US-025, US-027): the same filters. */
export const competitionMapQuerySchema = z
  .object(discoveryFilters)
  .superRefine(checkFilterPairs);
