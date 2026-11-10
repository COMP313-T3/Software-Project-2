import * as climberRouteAssistantService from "../services/climberRouteAssistantService.js";

/**
 * Builds the Climber AI Route Assistant handlers (US-033).
 *
 * @param {ReturnType<typeof import("../services/geminiClient.js").createGeminiClient>} ai The
 *   AI client.
 * @returns {Record<"getClimberAssistant" | "askClimberAssistant", import("express").RequestHandler>}
 */
export function createClimberAssistantHandlers(ai) {
  return {
    /**
     * GET /api/competitions/:competitionId/route-assistant. Answers whether the logged-in Climber
     * can ask about this competition, and the data an answer would be based on.
     */
    async getClimberAssistant(req, res) {
      res.json(
        await climberRouteAssistantService.getClimberAssistant(
          req.auth.userId,
          res.locals.params.competitionId,
          ai,
        ),
      );
    },

    /**
     * POST /api/competitions/:competitionId/route-assistant. Answers the Climber's question with
     * the AI's suggestion, the routes it recommends, and the data it was based on. The Climber is
     * always the one in the access token.
     */
    async askClimberAssistant(req, res) {
      res.json(
        await climberRouteAssistantService.askClimberAssistant({
          climberId: req.auth.userId,
          competitionId: res.locals.params.competitionId,
          question: req.body.question,
          ai,
        }),
      );
    },
  };
}
