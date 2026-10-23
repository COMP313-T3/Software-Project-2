import * as discoveryService from "../services/discoveryService.js";

/**
 * GET /api/competitions (US-025, US-026). Answers { competitions, total, page, limit }: the
 * available upcoming competitions that match the validated search and filters in
 * res.locals.query, in the order it asks for, soonest first by default.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function listCompetitions(req, res) {
  res.json(await discoveryService.listCompetitions(req.auth.userId, res.locals.query));
}

/**
 * Builds GET /api/competitions/map (US-025, US-027). It answers { pins, total, unmapped,
 * pending, truncated, origin }: the same competitions as the List View, as map pins, and the
 * starting point, if any.
 *
 * @param {((addresses: string[]) => Promise<Map<string, { lat: number, lng: number } | null>>) | null} findPoints
 *   Finds where addresses are, for competitions without a saved pin, or null to use saved pins
 *   only.
 * @returns {import("express").RequestHandler} The handler, which needs req.auth from requireAuth.
 */
export function createCompetitionMapHandler(findPoints) {
  return async (req, res) => {
    res.json(
      await discoveryService.competitionMap(
        req.auth.userId,
        res.locals.query,
        findPoints,
      ),
    );
  };
}

/**
 * GET /api/competitions/filters (US-025, US-026). Answers { gyms, registration, sorts,
 * distanceChoicesKm, maxRadiusKm, hasSavedLocation }: the choices the Discover page offers in
 * its filters and order.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getDiscoveryOptions(req, res) {
  res.json(await discoveryService.discoveryOptions(req.auth.userId));
}

/**
 * GET /api/competitions/:competitionId (US-025 criterion 5). Answers the Event Details of one
 * published competition, or 404 COMPETITION_NOT_FOUND.
 *
 * @param {import("express").Request} req Request with req.auth from requireAuth.
 * @param {import("express").Response} res Outgoing response.
 */
export async function getCompetition(req, res) {
  res.json(
    await discoveryService.getCompetitionDetails(
      req.auth.userId,
      res.locals.params.competitionId,
    ),
  );
}
