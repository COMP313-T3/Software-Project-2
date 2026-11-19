import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./apiClient.ts";
import {
  askRouteAssistant,
  assistantAccessLost,
  getRouteAssistant,
  normalizeRouteQuestion,
  routeAssistantProblem,
  routeQuestionProblem,
  type RouteAssistantAnswer,
  type RouteAssistantAvailability,
} from "./routeAssistantApi.ts";

vi.mock("./apiClient.ts", async (original) => ({
  ...(await original<typeof import("./apiClient.ts")>()),
  apiRequest: vi.fn(),
}));
vi.mock("./sessionClient.ts", () => ({
  withAccessToken: (send: (token: string) => unknown) => send("test-token"),
}));

const id = "507f1f77bcf86cd799439011";
const path = `/api/gym-admin/competitions/${id}/route-assistant`;
const NOTICE =
  "AI-generated. May be inaccurate. Answers use this competition's official statistics and never change official scores, results, rankings or route grades.";

function availability(): RouteAssistantAvailability {
  return {
    competition: { _id: id, name: "Fall Boulder Bash" },
    enabled: true,
    canAsk: true,
    reasons: [],
    limits: { questionMaxLength: 500, questionsPerHour: 30 },
    notice: NOTICE,
    basedOn: {
      division: null,
      routes: [
        {
          route: "3",
          name: "Crimp Ladder",
          grade: "V5",
          climbersWithResults: 4,
          sends: 3,
          flashes: 1,
          completionRatePercent: 75,
          averageAttempts: 2.25,
          flashRatePercent: 25,
          enoughData: true,
        },
      ],
      resultCount: 4,
      routesLeftOut: 0,
      minimumResultsForComparison: 3,
    },
  };
}

function answer(overrides: Partial<RouteAssistantAnswer> = {}): RouteAssistantAnswer {
  const { competition, notice, basedOn } = availability();
  return {
    competition,
    notice,
    basedOn,
    page: "route-statistics",
    question: "Which route was the hardest?",
    answer: "Route 3 was the hardest.",
    truncated: false,
    answeredAt: "2026-11-14T16:30:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
});

describe("US-023 Gym Admin AI Route Assistant API", () => {
  it("reads whether questions can be asked with the Gym Admin's access token", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue(availability());

    await expect(getRouteAssistant(id, signal)).resolves.toEqual(availability());

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(path, {
      signal,
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it.each([
    [
      "another competition",
      (value: RouteAssistantAvailability) => (value.competition._id = "507f1f77bcf86cd799439099"),
    ],
    ["no notice", (value: RouteAssistantAvailability) => (value.notice = "")],
    [
      "a completion rate over 100%",
      (value: RouteAssistantAvailability) => (value.basedOn.routes[0].completionRatePercent = 140),
    ],
    ["no question length", (value: RouteAssistantAvailability) => (value.limits.questionMaxLength = 0)],
  ])("refuses availability with %s", async (_label, alter) => {
    const value = availability();
    alter(value);
    vi.mocked(apiRequest).mockResolvedValue(value);

    await expect(getRouteAssistant(id)).rejects.toThrow("Invalid route assistant availability.");
  });

  it("sends the question with the page the chatbot is on, and waits for the AI (AC-022)", async () => {
    vi.mocked(apiRequest).mockResolvedValue(answer());

    await askRouteAssistant(id, "  Which route   was the hardest? ", { page: "route-statistics", history: [] });

    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(path, {
      method: "POST",
      body: { question: "Which route was the hardest?", page: "route-statistics" },
      signal: undefined,
      headers: { Authorization: "Bearer test-token" },
      timeoutMs: 40_000,
    });
  });

  it("sends the earlier messages and the division the page is showing", async () => {
    const history = [
      { role: "user" as const, text: "How close is the race?" },
      { role: "assistant" as const, text: "Two Climbers share 2nd place." },
    ];
    vi.mocked(apiRequest).mockResolvedValue(answer({ page: "leaderboard", question: "And in Youth?" }));

    await askRouteAssistant(id, "And in Youth?", {
      page: "leaderboard",
      history,
      divisionId: "507f1f77bcf86cd799439041",
    });

    expect(vi.mocked(apiRequest).mock.calls[0][1]?.body).toEqual({
      question: "And in Youth?",
      page: "leaderboard",
      history,
      divisionId: "507f1f77bcf86cd799439041",
    });
  });

  it.each([
    ["written for another page", { page: "results" as const }],
    ["to a different question", { question: "Something else?" }],
    ["without text", { answer: " " }],
    ["without a time", { answeredAt: "soon" }],
  ])("refuses an answer %s", async (_label, overrides) => {
    vi.mocked(apiRequest).mockResolvedValue(answer(overrides));

    await expect(askRouteAssistant(id, "Which route was the hardest?", { page: "route-statistics" })).rejects.toThrow(
      "Invalid route assistant answer.",
    );
  });

  it.each([
    ["", "Use 3 to 500 characters for your question."],
    ["a".repeat(501), "Use 3 to 500 characters for your question."],
    ["12 ?? 34", "Enter a question about how the routes performed."],
    ["Which route\u0007 was hardest?", "Remove the special characters from your question."],
    ["Which route was hardest?\nAnd why?", ""],
  ])("checks the question %j like the API", (question, problem) => {
    expect(routeQuestionProblem(question, 500)).toBe(problem);
  });

  it("tidies a question's spacing like the API", () => {
    expect(normalizeRouteQuestion("  Which   route?\n\n\n\nWhy? ")).toBe("Which route?\n\nWhy?");
  });

  it.each([
    [new ApiError(401, "SESSION_EXPIRED", "Expired."), "ask", "Your session has ended. Sign in again to continue."],
    [
      new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."),
      "load",
      "This competition isn't available to your account.",
    ],
    [
      new ApiError(429, "TOO_MANY_REQUESTS", "Slow down."),
      "ask",
      "You've reached the hourly question limit. Try again later.",
    ],
    [
      new ApiError(503, "ROUTE_ASSISTANT_BUSY", "Busy."),
      "ask",
      "The Route Assistant is busy. Wait a moment before trying again.",
    ],
    [
      new ApiError(503, "ROUTE_ASSISTANT_UNAVAILABLE", "Off."),
      "ask",
      "The Route Assistant is unavailable right now. Try again later.",
    ],
    [
      new ApiError(500, "INTERNAL_ERROR", "Stack trace."),
      "load",
      "Couldn't load the Route Assistant. Please try again.",
    ],
    [new Error("Broken."), "ask", "Couldn't get an answer. Please try again."],
  ] as const)("explains %s", (error, action, message) => {
    expect(routeAssistantProblem(error, action)).toBe(message);
  });

  it("knows when access to the assistant is gone", () => {
    expect(assistantAccessLost(new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found."))).toBe(true);
    expect(assistantAccessLost(new ApiError(503, "ROUTE_ASSISTANT_BUSY", "Busy."))).toBe(false);
    expect(assistantAccessLost(new Error("Offline."))).toBe(false);
  });
});
