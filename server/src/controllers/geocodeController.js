import { lookUpLocation, lookUpPlace } from "../services/geocodingService.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

function unavailable() {
  return new AppError(
    503,
    "GEOCODING_UNAVAILABLE",
    "Address lookup isn't working right now. You can still type your address.",
  );
}

/**
 * Builds the address lookup handlers. They ask Google from the server, since Google says its
 * Geocoding API v4 shouldn't be called from browser code.
 *
 * @param {string} apiKey Google Maps key for the Geocoding API. Empty turns lookups off.
 * @returns {{ findPlace: import("express").RequestHandler, findLocation: import("express").RequestHandler }} The handlers.
 */
export function createGeocodeHandlers(apiKey) {
  async function lookUp(req, lookup) {
    if (!apiKey) {
      logger.error("GOOGLE_MAPS_SERVER_KEY is not set", { requestId: req.id });
      throw unavailable();
    }
    try {
      return await lookup();
    } catch (error) {
      logger.error("Address lookup failed", {
        requestId: req.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw unavailable();
    }
  }

  return {
    findPlace: async (req, res) => {
      const found = await lookUp(req, () =>
        lookUpPlace(apiKey, res.locals.query.id),
      );
      if (!found) {
        throw new AppError(
          404,
          "ADDRESS_NOT_FOUND",
          "We couldn't find that address. You can type it instead.",
        );
      }
      res.json(found);
    },
    findLocation: async (req, res) => {
      const found = await lookUp(req, () =>
        lookUpLocation(apiKey, res.locals.query),
      );
      if (!found) {
        throw new AppError(
          404,
          "ADDRESS_NOT_FOUND",
          "No address found at that spot.",
        );
      }
      res.json(found);
    },
  };
}
