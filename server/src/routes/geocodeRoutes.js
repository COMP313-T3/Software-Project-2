import { Router } from "express";
import { createGeocodeHandlers } from "../controllers/geocodeController.js";
import { hourlyRateLimit } from "../middleware/hourlyRateLimit.js";
import { validateQuery } from "../middleware/validateQuery.js";
import {
  locationLookupSchema,
  placeLookupSchema,
} from "../schemas/geocodeSchemas.js";

/**
 * Routes under /api/geocode, used by the sign-up address step. They share one limit per IP
 * address, which also protects the Google Maps quota.
 *
 * @param {{ googleMapsServerKey: string, geocodeLimitPerHour: number }} options Lookup settings.
 * @returns {import("express").Router} The router.
 */
export function createGeocodeRoutes({
  googleMapsServerKey,
  geocodeLimitPerHour,
}) {
  const router = Router();
  const { findPlace, findLocation } =
    createGeocodeHandlers(googleMapsServerKey);

  router.use(
    hourlyRateLimit(
      geocodeLimitPerHour,
      "Too many address lookups. Please try again later.",
    ),
  );
  router.get("/place", validateQuery(placeLookupSchema), findPlace);
  router.get("/location", validateQuery(locationLookupSchema), findLocation);

  return router;
}
