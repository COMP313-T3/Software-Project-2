import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient.ts";
import { forgetConversations } from "../../lib/assistantChat.ts";
import { askClimberAssistant, getClimberAssistant } from "../../lib/climberAssistantApi.ts";
import {
  askRouteAssistant,
  getRouteAssistant,
  type RouteAssistantAnswer,
  type RouteAssistantAvailability,
} from "../../lib/routeAssistantApi.ts";
import {
  ASSISTANT_COMPETITION as id,
  ASSISTANT_NOTICE,
  assistantAnswer,
  assistantAvailability,
  routeFour,
  routeThree,
} from "../../test/climberAssistantFixtures.ts";
import AssistantChat from "./AssistantChat.tsx";

let user: { userId: string; role: string; email: string } | null;

vi.mock("../session/sessionContext.ts", () => ({ useSession: () => ({ user, logOut: vi.fn() }) }));
vi.mock("../../lib/climberAssistantApi.ts", async (original) => ({
  ...(await original<typeof import("../../lib/climberAssistantApi.ts")>()),
  getClimberAssistant: vi.fn(),
  askClimberAssistant: vi.fn(),
}));
vi.mock("../../lib/routeAssistantApi.ts", async (original) => ({
  ...(await original<typeof import("../../lib/routeAssistantApi.ts")>()),
  getRouteAssistant: vi.fn(),
  askRouteAssistant: vi.fn(),
}));

const GYM_ADMIN_NOTICE =
  "AI-generated. May be inaccurate. Answers use this competition's official statistics and never change official scores, results, rankings or route grades.";
const WORKING = "Working on your answer…";

function gymAdminAvailability(): RouteAssistantAvailability {
  return {
    competition: { _id: id, name: "Fall Boulder Bash" },
    enabled: true,
    canAsk: true,
    reasons: [],
    limits: { questionMaxLength: 500, questionsPerHour: 30 },
    notice: GYM_ADMIN_NOTICE,
    basedOn: { division: null, routes: [], resultCount: 4, routesLeftOut: 0, minimumResultsForComparison: 3 },
  };
}

function gymAdminAnswer(overrides: Partial<RouteAssistantAnswer> = {}): RouteAssistantAnswer {
  const { competition, notice, basedOn } = gymAdminAvailability();
  return {
    competition,
    notice,
    basedOn,
    page: "route-statistics",
    question: "Which route was the hardest?",
    answer: "Route 7 was the hardest: 1 of 6 Climbers topped it.",
    truncated: false,
    answeredAt: "2026-11-14T16:30:00.000Z",
    ...overrides,
  };
}

function climberChat(page: "scorecard" | "leaderboard" = "scorecard", competitionId = id) {
  return (
    <MemoryRouter>
      <AssistantChat audience="climber" page={page} competitionId={competitionId} competitionName="Fall Boulder Bash" />
    </MemoryRouter>
  );
}

function renderClimber(page: "scorecard" | "leaderboard" = "scorecard") {
  return render(climberChat(page));
}

function onPhone() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: query === "(max-width: 767px)", media: query }) as MediaQueryList,
  );
}

const launcher = () => screen.getByText("Ask AI", { selector: "button" }) as HTMLButtonElement;
const panel = () => screen.getByRole("dialog", { name: "AI Route Assistant" });
const question = () => screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;
const log = () => screen.getByRole("log", { name: "Conversation" });
const said = () => [...log().children].map((message) => message.textContent);

async function open() {
  fireEvent.click(launcher());
  await screen.findByRole("list", { name: "Suggested questions" });
}

async function answered(text = "Try Route 4 next.") {
  await waitFor(() => expect(log().textContent).toContain(text));
}

beforeEach(() => {
  user = { userId: "climber-one", role: "CLIMBER", email: "climber@example.com" };
  window.localStorage.clear();
  forgetConversations();
  vi.mocked(getClimberAssistant).mockReset().mockResolvedValue(assistantAvailability());
  vi.mocked(askClimberAssistant)
    .mockReset()
    .mockImplementation(async (_competitionId, asked, chat) => ({
      ...assistantAnswer(),
      page: chat.page,
      question: asked,
      answer: "Try Route 4 next.",
      recommendedRoutes: [],
    }));
  vi.mocked(getRouteAssistant).mockReset().mockResolvedValue(gymAdminAvailability());
  vi.mocked(askRouteAssistant)
    .mockReset()
    .mockImplementation(async (_competitionId, asked, chat) => gymAdminAnswer({ page: chat.page, question: asked }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AC-022 the Ask AI button and its panel", () => {
  it("shows only the Ask AI button until it's opened, and asks the server nothing", () => {
    renderClimber();

    expect(launcher().hidden).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getClimberAssistant).not.toHaveBeenCalled();
    expect(askClimberAssistant).not.toHaveBeenCalled();
  });

  it("shows nothing to someone who isn't logged in", () => {
    user = null;
    const { container } = renderClimber();

    expect(container.textContent).toBe("");
  });

  it("opens beside the page on a wide screen, already set to the competition and the page", async () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, "show");
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    renderClimber();

    await open();

    expect(show).toHaveBeenCalledOnce();
    expect(showModal).not.toHaveBeenCalled();
    expect(within(panel()).getByText("Fall Boulder Bash, My scorecard")).toBeTruthy();
    expect(getClimberAssistant).toHaveBeenCalledExactlyOnceWith(id, expect.any(AbortSignal));
    expect(document.activeElement).toBe(question());
    expect(launcher().hidden).toBe(true);
    expect(within(panel()).getByText(ASSISTANT_NOTICE)).toBeTruthy();
  });

  it("opens as a sheet over the page on a phone, without opening the keyboard", async () => {
    onPhone();
    const show = vi.spyOn(HTMLDialogElement.prototype, "show");
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    renderClimber();

    await open();

    expect(showModal).toHaveBeenCalledOnce();
    expect(show).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "AI Route Assistant" }));
  });

  it("closes with Close, and gives focus back to the Ask AI button", async () => {
    renderClimber();
    await open();

    fireEvent.click(within(panel()).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(launcher().hidden).toBe(false);
    expect(document.activeElement).toBe(launcher());
  });

  it("closes with Escape", async () => {
    renderClimber();
    await open();

    fireEvent.keyDown(question(), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(launcher());
  });

  it("closes when the page behind the sheet is tapped, but not when the sheet is", async () => {
    onPhone();
    renderClimber();
    await open();

    fireEvent.click(within(panel()).getByText("Suggested questions"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.click(panel());

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("AC-022 the first-time welcome and the suggested questions", () => {
  it("welcomes a first-time user with what the assistant knows, what to ask and what it can't do", async () => {
    renderClimber();

    await open();

    const welcome = within(screen.getByRole("region", { name: "Welcome to the AI Route Assistant" }));
    expect(welcome.getAllByRole("listitem").map((tip) => tip.textContent)).toEqual([
      "It already knows this competition, your results and your division's standings, so you don't need to explain them.",
      "Ask which problem to try next, or what your scorecard means. Choose a suggested question to send it, or type your own.",
      "It only gives suggestions. It can't change scores, results or rankings.",
    ]);
  });

  it("doesn't show the welcome again, and keeps the suggested questions", async () => {
    const first = renderClimber();
    await open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Close" }));

    await open();
    expect(screen.queryByRole("region", { name: "Welcome to the AI Route Assistant" })).toBeNull();
    expect(within(panel()).getByText("Ask which problem to try next, or what your scorecard means.")).toBeTruthy();
    first.unmount();
    renderClimber();
    await open();

    expect(screen.queryByRole("region", { name: "Welcome to the AI Route Assistant" })).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "Suggested questions" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Which route should I try next?",
      "Which unfinished route has the best completion rate?",
      "What route looks the easiest?",
      "Explain my scorecard.",
    ]);
  });

  it("welcomes the same user once more on another kind of page, and another user on the same one", async () => {
    const scorecard = renderClimber();
    await open();
    scorecard.unmount();

    const leaderboard = renderClimber("leaderboard");
    await open();
    expect(screen.getByRole("region", { name: "Welcome to the AI Route Assistant" })).toBeTruthy();
    expect(within(panel()).getByText("Fall Boulder Bash, Live leaderboard")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Suggested questions" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "How far am I from the next rank?",
      "What is my current ranking?",
      "How many points separate me from rank 3?",
      "Explain the leaderboard to me.",
    ]);
    leaderboard.unmount();

    user = { userId: "climber-two", role: "CLIMBER", email: "other@example.com" };
    renderClimber();
    await open();
    expect(screen.getByRole("region", { name: "Welcome to the AI Route Assistant" })).toBeTruthy();
  });

  it("sends a suggested question with one click, and shows the conversation", async () => {
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Which route should I try next?" }));

    expect(askClimberAssistant).toHaveBeenCalledExactlyOnceWith(
      id,
      "Which route should I try next?",
      { page: "scorecard", history: [] },
      expect.any(AbortSignal),
    );
    await answered();
    expect(said()).toEqual([
      "You asked: Which route should I try next?",
      "The Route Assistant answered: Try Route 4 next.",
    ]);
    expect(question().value).toBe("");
  });

  it("folds the suggested questions away after the first question, and opens them again on request", async () => {
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));
    await answered();

    const toggle = screen.getByRole("button", { name: "Show suggested questions" });
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Explain my scorecard." })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide suggested questions" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "What route looks the easiest?" }));

    await waitFor(() => expect(askClimberAssistant).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askClimberAssistant).mock.calls[1][1]).toBe("What route looks the easiest?");
  });
});

describe("AC-022 asking a question", () => {
  it("sends a typed question with Enter, and keeps Shift and Enter for a new line", async () => {
    renderClimber();
    await open();

    fireEvent.change(question(), { target: { value: "How far am I\nfrom 1st place?" } });
    fireEvent.keyDown(question(), { key: "Enter", shiftKey: true });
    expect(askClimberAssistant).not.toHaveBeenCalled();
    fireEvent.keyDown(question(), { key: "Enter" });

    expect(vi.mocked(askClimberAssistant).mock.calls[0][1]).toBe("How far am I\nfrom 1st place?");
    await answered();
    expect(question().value).toBe("");
    expect(document.activeElement).toBe(question());
  });

  it("doesn't send while text is still being composed", async () => {
    renderClimber();
    await open();
    fireEvent.change(question(), { target: { value: "Which route" } });

    fireEvent.keyDown(question(), { key: "Enter", isComposing: true });

    expect(askClimberAssistant).not.toHaveBeenCalled();
  });

  it("sends with the Send button", async () => {
    renderClimber();
    await open();
    fireEvent.change(question(), { target: { value: "  Which   route is easiest? " } });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(vi.mocked(askClimberAssistant).mock.calls[0][1]).toBe("Which route is easiest?");
    await answered();
  });

  it("says it's working while the AI answers, and takes one question at a time", async () => {
    let finish = (_value: Awaited<ReturnType<typeof askClimberAssistant>>) => {};
    vi.mocked(askClimberAssistant).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Which route should I try next?" }));

    expect(screen.getByText(WORKING).getAttribute("role")).toBe("status");
    expect(said()).toEqual(["You asked: Which route should I try next?"]);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(question(), { target: { value: "And after that?" } });
    fireEvent.keyDown(question(), { key: "Enter" });
    expect(askClimberAssistant).toHaveBeenCalledOnce();

    await act(async () => finish({ ...assistantAnswer(), answer: "Try Route 4 next.", recommendedRoutes: [] }));

    expect(screen.queryByText(WORKING)).toBeNull();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    expect(question().value).toBe("And after that?");
  });

  it("sends the earlier messages with a follow-up question", async () => {
    renderClimber();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));
    await answered();

    fireEvent.change(question(), { target: { value: "Which one is left?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(askClimberAssistant).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askClimberAssistant).mock.calls[1][2]).toEqual({
      page: "scorecard",
      history: [
        { role: "user", text: "Explain my scorecard." },
        { role: "assistant", text: "Try Route 4 next." },
      ],
    });
  });

  it("lists the routes the answer recommends", async () => {
    vi.mocked(askClimberAssistant).mockResolvedValue({
      ...assistantAnswer(),
      recommendedRoutes: [routeFour(), routeThree()],
    });
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Which route should I try next?" }));

    const routes = await within(log()).findAllByRole("listitem");
    expect(within(log()).getByText("Routes to try")).toBeTruthy();
    expect(routes).toHaveLength(2);
    expect(routes[0].textContent).toMatch(/^Route 4, .+: 120 points if you top it on your next attempt$/);
  });

  it("says when an answer was cut short", async () => {
    vi.mocked(askClimberAssistant).mockResolvedValue({ ...assistantAnswer(), truncated: true, recommendedRoutes: [] });
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));

    expect(await screen.findByText("This answer was cut short. Ask again for the rest.")).toBeTruthy();
  });

  it("shows an answer as text, never as HTML", async () => {
    vi.mocked(askClimberAssistant).mockResolvedValue({
      ...assistantAnswer(),
      answer: '<img src="x" onerror="alert(1)"> <b>Try</b> Route 4.',
      recommendedRoutes: [],
    });
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));

    await answered('<img src="x" onerror="alert(1)"> <b>Try</b> Route 4.');
    expect(log().querySelector("img, b")).toBeNull();
  });

  it.each([
    ["???", "Enter a question about the routes or your ranking."],
    ["Hi", "Use 3 to 300 characters."],
    ["", "Use 3 to 300 characters."],
  ])("checks the question %j before sending it", async (text, problem) => {
    renderClimber();
    await open();
    fireEvent.change(question(), { target: { value: text } });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("alert").textContent).toBe(problem);
    expect(question().getAttribute("aria-invalid")).toBe("true");
    expect(askClimberAssistant).not.toHaveBeenCalled();
    fireEvent.change(question(), { target: { value: "Which route next?" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("counts the characters near the longest question", async () => {
    renderClimber();
    await open();
    expect(screen.getByText("Press Enter to send, or Shift and Enter for a new line.")).toBeTruthy();

    fireEvent.change(question(), { target: { value: "a".repeat(250) } });

    expect(screen.getByText("250 of 300 characters.")).toBeTruthy();
    expect(question().maxLength).toBe(300);
  });
});

describe("AC-022 when the AI can't answer", () => {
  it("says why in plain words, keeps the question, and can be asked again", async () => {
    vi.mocked(askClimberAssistant).mockRejectedValueOnce(
      new ApiError(503, "ROUTE_ASSISTANT_BUSY", "The Route Assistant is busy right now. Try again in a minute."),
    );
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Which route should I try next?" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The Route Assistant is busy right now. Try again in a minute.",
    );
    expect(question().value).toBe("Which route should I try next?");
    expect(document.activeElement).toBe(question());
    expect(said()).toEqual([]);
    expect(screen.queryByText(WORKING)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await answered();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(vi.mocked(askClimberAssistant).mock.calls[1][2]).toEqual({ page: "scorecard", history: [] });
  });

  it.each([
    [
      new ApiError(
        429,
        "TOO_MANY_REQUESTS",
        "You've asked the Route Assistant a lot of questions this hour. Try again later.",
      ),
      "You've asked the Route Assistant a lot of questions this hour. Try again later.",
    ],
    [new ApiError(0, "TIMEOUT", "Slow."), "The Route Assistant took too long to answer. Try again."],
    [new ApiError(0, "NETWORK_ERROR", "Offline."), "Couldn't reach TopSend. Check your connection and try again."],
    [
      new ApiError(422, "ROUTE_ASSISTANT_DECLINED", "Declined."),
      "The Route Assistant couldn't answer that question. Ask about your routes, your scorecard or the standings.",
    ],
    [new Error("stack trace at line 4"), "Couldn't get an answer. Please try again."],
  ])("explains %s", async (error, message) => {
    vi.mocked(askClimberAssistant).mockRejectedValue(error);
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));

    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("offers to sign in again when the login ended", async () => {
    vi.mocked(askClimberAssistant).mockRejectedValue(new ApiError(401, "SESSION_EXPIRED", "Expired."));
    renderClimber();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("Your session has ended. Sign in again to continue.")).toBeTruthy();
    expect(alert.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("says why the Climber can't ask yet, and checks again on request", async () => {
    vi.mocked(getClimberAssistant).mockResolvedValueOnce({
      ...assistantAvailability(),
      canAsk: false,
      reasons: ["Your place isn't confirmed yet, so the Route Assistant can't advise you on this competition."],
    });
    renderClimber();

    fireEvent.click(launcher());

    expect(await screen.findByText("You can't ask about this competition right now.")).toBeTruthy();
    expect(
      screen.getByText("Your place isn't confirmed yet, so the Route Assistant can't advise you on this competition."),
    ).toBeTruthy();
    expect(question().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("list", { name: "Suggested questions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    await screen.findByRole("list", { name: "Suggested questions" });
    expect(question().disabled).toBe(false);
    expect(getClimberAssistant).toHaveBeenCalledTimes(2);
  });

  it("says when the assistant isn't set up", async () => {
    vi.mocked(getClimberAssistant).mockResolvedValue({
      ...assistantAvailability(),
      enabled: false,
      canAsk: false,
      reasons: ["The Route Assistant isn't set up on this server."],
    });
    renderClimber();

    fireEvent.click(launcher());

    expect(await screen.findByText("The Route Assistant isn't set up on this server.")).toBeTruthy();
  });

  it("says when the assistant couldn't be loaded, and tries again on request", async () => {
    vi.mocked(getClimberAssistant).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Offline."));
    renderClimber();

    fireEvent.click(launcher());

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("Couldn't reach TopSend. Check your connection and try again.")).toBeTruthy();
    fireEvent.click(alert.getByRole("button", { name: "Try again" }));

    await screen.findByRole("list", { name: "Suggested questions" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("doesn't offer to try again when the competition isn't the user's", async () => {
    vi.mocked(getClimberAssistant).mockRejectedValue(
      new ApiError(
        404,
        "REGISTRATION_NOT_FOUND",
        "You're not registered for this competition, so the Route Assistant can't advise you on it.",
      ),
    );
    renderClimber();

    fireEvent.click(launcher());

    const alert = within(await screen.findByRole("alert"));
    expect(
      alert.getByText("You're not registered for this competition, so the Route Assistant can't advise you on it."),
    ).toBeTruthy();
    expect(alert.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("AC-022 the conversation stays while the user stays in TopSend", () => {
  it("shows the same conversation again after a visit to another page", async () => {
    const first = renderClimber();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));
    await answered();
    first.unmount();

    renderClimber();
    fireEvent.click(launcher());

    expect(said()).toEqual(["You asked: Explain my scorecard.", "The Route Assistant answered: Try Route 4 next."]);
    expect(await screen.findByRole("button", { name: "Show suggested questions" })).toBeTruthy();
  });

  it("keeps a conversation to its page, its competition and its user", async () => {
    const first = renderClimber();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));
    await answered();
    first.unmount();

    const otherPage = renderClimber("leaderboard");
    fireEvent.click(launcher());
    expect(said()).toEqual([]);
    otherPage.unmount();

    const otherCompetition = render(climberChat("scorecard", "507f1f77bcf86cd799439099"));
    fireEvent.click(launcher());
    expect(said()).toEqual([]);
    otherCompetition.unmount();

    user = { userId: "climber-two", role: "CLIMBER", email: "other@example.com" };
    renderClimber();
    fireEvent.click(launcher());
    expect(said()).toEqual([]);
  });

  it("doesn't keep a question that got no answer", async () => {
    vi.mocked(askClimberAssistant).mockRejectedValue(new ApiError(503, "ROUTE_ASSISTANT_BUSY", "Busy."));
    const first = renderClimber();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Explain my scorecard." }));
    await screen.findByRole("alert");
    first.unmount();

    renderClimber();
    fireEvent.click(launcher());

    expect(said()).toEqual([]);
  });
});

describe("AC-022 the Gym Admin's chatbot", () => {
  function renderGymAdmin(
    page: "route-statistics" | "results" | "leaderboard" = "route-statistics",
    division: { _id: string; name: string } | null = null,
  ) {
    user = { userId: "gym-admin-one", role: "GYM_ADMIN", email: "admin@example.com" };
    return render(
      <MemoryRouter>
        <AssistantChat
          audience="gym-admin"
          page={page}
          competitionId={id}
          competitionName="Fall Boulder Bash"
          division={division}
        />
      </MemoryRouter>,
    );
  }

  it("uses the Gym Admin's assistant, with the page's welcome, questions and notice", async () => {
    renderGymAdmin();

    await open();

    expect(getRouteAssistant).toHaveBeenCalledExactlyOnceWith(id, expect.any(AbortSignal));
    expect(getClimberAssistant).not.toHaveBeenCalled();
    expect(within(panel()).getByText("Fall Boulder Bash, Route statistics")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Welcome to the AI Route Assistant" }))
        .getAllByRole("listitem")
        .at(-1)?.textContent,
    ).toBe(
      "It only explains. It can't change scores, results, rankings or route grades, and it never names a Climber.",
    );
    expect(
      within(screen.getByRole("list", { name: "Suggested questions" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "Which route was the hardest?",
      "Which route had the lowest completion rate?",
      "Which route had the highest flash rate?",
      "Summarize the route statistics.",
    ]);
    expect(within(panel()).getByText(GYM_ADMIN_NOTICE)).toBeTruthy();
    expect(question().maxLength).toBe(500);
  });

  it("asks from the page it's on, and shows the answer", async () => {
    renderGymAdmin("results");
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Which route took the most attempts?" }));

    expect(askRouteAssistant).toHaveBeenCalledExactlyOnceWith(
      id,
      "Which route took the most attempts?",
      { page: "results", history: [], divisionId: undefined },
      expect.any(AbortSignal),
    );
    await answered("Route 7 was the hardest: 1 of 6 Climbers topped it.");
    expect(askClimberAssistant).not.toHaveBeenCalled();
    expect(within(log()).queryByText("Routes to try")).toBeNull();
  });

  it("asks about the division the leaderboard is showing", async () => {
    renderGymAdmin("leaderboard", { _id: "507f1f77bcf86cd799439041", name: "Youth" });
    await open();

    expect(within(panel()).getByText("Fall Boulder Bash, Live leaderboard, Youth division")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "How close is the race in each division?" }));

    expect(vi.mocked(askRouteAssistant).mock.calls[0][2]).toEqual({
      page: "leaderboard",
      history: [],
      divisionId: "507f1f77bcf86cd799439041",
    });
  });

  it("explains a problem in the Gym Admin's words", async () => {
    vi.mocked(askRouteAssistant).mockRejectedValue(
      new ApiError(409, "ROUTE_ASSISTANT_NO_DATA", "There are no official results in this competition yet."),
    );
    renderGymAdmin();
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Which route was the hardest?" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "There are no official results to explain right now. Refresh the competition data.",
    );
    expect(question().value).toBe("Which route was the hardest?");
  });

  it("checks a Gym Admin's question with the Gym Admin's rules", async () => {
    renderGymAdmin();
    await open();
    fireEvent.change(question(), { target: { value: "?? 12" } });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("alert").textContent).toBe("Enter a question about how the routes performed.");
  });
});
