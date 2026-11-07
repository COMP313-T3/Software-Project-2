import * as routeAssistantService from "../services/routeAssistantService.js";

/**
 * Builds the Gym Admin AI Route Assistant handlers (US-023).
 *
 * @param {ReturnType<typeof import("../services/geminiClient.js").createGeminiClient>} ai The
 *   AI client.
 * @returns {Record<"getRouteAssistant" | "askRouteAssistant", import("express").RequestHandler>}
 */
export function createRouteAssistantHandlers(ai) {
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
          ai,
          res.locals.query,
        ),
      );
    },

    /**
     * POST /api/gym-admin/competitions/:competitionId/route-assistant. Answers the Gym Admin's
     * question with the AI's explanation and the statistics it was based on. The Gym Admin is
     * always the one in the access token.
     */
    async askRouteAssistant(req, res) {
      res.json(
        await routeAssistantService.askRouteAssistant({
          gyms: res.locals.gyms,
          competitionId: res.locals.params.competitionId,
          userId: req.auth.userId,
          question: req.body.question,
          divisionId: req.body.divisionId,
          routeIds: req.body.routeIds,
          ai,
        }),
      );
    },
  };
}
