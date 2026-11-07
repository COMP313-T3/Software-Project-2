import * as routeAssistantService from "../services/routeAssistantService.js";

/**
 * Builds the Gym Admin AI Route Assistant handlers (US-023).
 *
 * @param {ReturnType<typeof import("../services/claudeClient.js").createClaudeClient>} claude The
 *   AI client.
 * @returns {Record<"getRouteAssistant" | "askRouteAssistant", import("express").RequestHandler>}
 */
export function createRouteAssistantHandlers(claude) {
  return {
    /**
     * GET /api/gym-admin/competitions/:competitionId/route-assistant. Answers whether questions
     * can be asked, and the official statistics an answer would be based on.
     */
    async getRouteAssistant(req, res) {
      res.json(
        await routeAssistantService.getRouteAssistant(
          res.locals.gyms,
          res.locals.params.competitionId,
          claude,
          res.locals.query,
        ),
      );
    },