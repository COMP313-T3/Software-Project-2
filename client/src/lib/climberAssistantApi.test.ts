import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient.ts";
import {
  askClimberAssistant,
  climberAssistantProblem,
  climberQuestionProblem,
  getClimberAssistant,
} from "./climberAssistantApi.ts";
import {
  ASSISTANT_COMPETITION as id,
  assistantAnswer,
  assistantAvailability,
  routeFour,
} from "../test/climberAssistantFixtures.ts";

vi.mock("./apiClient.ts", async (original) => ({
  ...(await original<typeof import("./apiClient.ts")>()),
  apiRequest: vi.fn(),
}));
vi.mock("./sessionClient.ts", () => ({
  withAccessToken: (send: (token: string) => unknown) => send("test-token"),
}));

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
});

describe("US-033 Climber AI Route Assistant API", () => {
  it("reads the Climber's own assistant data with their access token", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue(assistantAvailability());

    await expect(getClimberAssistant(id, signal)).resolves.toEqual(assistantAvailability());

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(`/api/competitions/${id}/route-assistant`, {
      signal,
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("sends only the question, with the API's spacing rules, and waits for the AI", async () => {
    vi.mocked(apiRequest).mockResolvedValue(assistantAnswer());

    await askClimberAssistant(id, "  Which route   should I try next?\n\n\n ");

    expect(apiRequest).toHaveBeenCalledWith(`/api/competitions/${id}/route-assistant`, {
      method: "POST",
      body: { question: "Which route should I try next?" },
      signal: undefined,
      headers: { Authorization: "Bearer test-token" },
      timeoutMs: 40_000,
    });
  });

  it.each([
    [
      "another competition",
      (value: ReturnType<typeof assistantAvailability>) => (value.competition._id = "507f1f77bcf86cd799439099"),
    ],
    ["no notice", (value: ReturnType<typeof assistantAvailability>) => (value.notice = "")],
    [
      "a reason while the Climber can ask",
      (value: ReturnType<typeof assistantAvailability>) => (value.reasons = ["Closed."]),
    ],
    ["a place of 0", (value: ReturnType<typeof assistantAvailability>) => (value.basedOn.you!.place = 0)],
    [
      "negative points to tie",
      (value: ReturnType<typeof assistantAvailability>) => (value.basedOn.placesAbove[0].pointsToTie = -5),
    ],
    [
      "a route without attempts left",
      (value: ReturnType<typeof assistantAvailability>) => (value.basedOn.routesToTry[0].attemptsLeft = 0),
    ],
    [
      "no finished flag",
      (value: ReturnType<typeof assistantAvailability>) =>
        delete (value.basedOn.competition as { finished?: boolean }).finished,
    ],
    [
      "a completion rate over 100%",
      (value: ReturnType<typeof assistantAvailability>) => (value.basedOn.routesToTry[0].completionRatePercent = 120),
    ],
    [
      "an unknown reason a route can't score",
      (value: ReturnType<typeof assistantAvailability>) =>
        ((value.basedOn.cantScore[0] as { reason: string }).reason = "closed"),
    ],
  ])("refuses assistant data with %s", async (_label, alter) => {
    const value = assistantAvailability();
    alter(value);
    vi.mocked(apiRequest).mockResolvedValue(value);

    await expect(getClimberAssistant(id)).rejects.toThrow("did not match this competition");
  });

  it("refuses an answer that recommends a route the Climber can't score on", async () => {
    const value = assistantAnswer();
    value.recommendedRoutes = [{ ...routeFour(), route: "1" }];
    vi.mocked(apiRequest).mockResolvedValue(value);

    await expect(askClimberAssistant(id, "Which route should I try next?")).rejects.toThrow("can't score on");
  });

  it("refuses an answer to a different question", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...assistantAnswer(), question: "Something else?" });

    await expect(askClimberAssistant(id, "Which route should I try next?")).rejects.toThrow("did not match");
  });

  it.each([
    ["", "Use 3 to 300 characters."],
    ["a".repeat(301), "Use 3 to 300 characters."],
    ["123 456", "Enter a question about the routes or your ranking."],
    ["Which route\u0007 next?", "Remove the special characters from your question."],
    ["Which route next?\nAnd why?", ""],
    ["Quelle voie dois-je essayer?", ""],
  ])("checks the question %j like the API", (question, problem) => {
    expect(climberQuestionProblem(question, 300)).toBe(problem);
  });

  it.each([
    [new ApiError(401, "UNAUTHORIZED", "Sign in."), "load", "Your session has ended. Sign in again to continue."],
    [new ApiError(0, "TIMEOUT", "Slow."), "ask", "The Route Assistant took too long to answer. Try again."],
    [
      new ApiError(0, "NETWORK_ERROR", "Offline."),
      "ask",
      "Couldn't reach TopSend. Check your connection and try again.",
    ],
    [
      new ApiError(409, "SCORING_NOT_CONFIGURED", "The gym hasn't set up scoring for this competition yet."),
      "ask",
      "The gym hasn't set up scoring for this competition yet.",
    ],
    [
      new ApiError(500, "INTERNAL_ERROR", "Stack trace."),
      "load",
      "Couldn't load the Route Assistant. Please try again.",
    ],
    [new Error("Broken."), "ask", "Couldn't get an answer. Please try again."],
  ] as const)("explains %s", (error, action, message) => {
    expect(climberAssistantProblem(error, action)).toBe(message);
  });
});
