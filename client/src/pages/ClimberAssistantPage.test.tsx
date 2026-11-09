import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClimberAssistantAnswer, ClimberAssistantAvailability } from "../lib/climberAssistantApi.ts";
import {
  ASSISTANT_COMPETITION as id,
  ASSISTANT_NOTICE as NOTICE,
  assistantAnswer,
  assistantAvailability,
  assistantData,
} from "../test/climberAssistantFixtures.ts";
import ClimberAssistantPage from "./ClimberAssistantPage.tsx";

vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({
    user: { userId: "climber-one", role: "CLIMBER", email: "climber@example.com" },
    logOut: vi.fn(),
  }),
}));
vi.mock("../lib/sessionClient.ts", () => ({
  withAccessToken: (send: (token: string) => unknown) => send("test-token"),
}));

const apiPath = `/api/competitions/${id}/route-assistant`;
const basedOn = assistantData();
const ready = assistantAvailability();
const answered = assistantAnswer();

let availability: ClimberAssistantAvailability;
let answer: ClimberAssistantAnswer | Response;
const fetchMock = vi.fn<typeof fetch>();
const gets = () => fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === "GET");
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const failure = (status: number, error: string, message: string, fields?: Record<string, string>) =>
  Response.json({ error, message, ...(fields ? { fields } : {}) }, { status });

beforeEach(() => {
  availability = ready;
  answer = answered;
  fetchMock.mockReset().mockImplementation(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(availability);
    return answer instanceof Response ? answer : Response.json(answer);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(competitionId = id) {
  return render(
    <MemoryRouter initialEntries={[`/my-events/${competitionId}/route-assistant`]}>
      <Routes>
        <Route
          path="/my-events/:competitionId/route-assistant"
          element={<ClimberAssistantPage returnTo={`/my-events/${id}?page=2`} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
const field = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your question" });
const askButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Ask assistant" });
const section = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;
async function ask(question = "Which route should I try next?") {
  fireEvent.change(await screen.findByRole("textbox", { name: "Your question" }), { target: { value: question } });
  fireEvent.click(askButton());
}

describe("US-033 #33.2 Climber AI Route Assistant page", () => {
  it("loads the Climber's standing for the competition with their own session", async () => {
    open(id.toUpperCase());

    expect(screen.getByRole("status").textContent).toBe("Loading the Route Assistant…");
    await screen.findByRole("heading", { name: "Fall Boulder Bash" });
    expect(String(gets()[0][0])).toBe(apiPath);
    expect(new Headers(gets()[0][1]?.headers).get("Authorization")).toBe("Bearer test-token");
    expect(screen.getByRole("link", { name: "Back to my event" }).getAttribute("href")).toBe(`/my-events/${id}?page=2`);
    const standing = section("Your standing now");
    expect(
      within(standing).getByText(
        (_, element) => element?.tagName === "P" && element.textContent === "3rd place in Open, of 5 Climbers",
      ),
    ).toBeTruthy();
    expect(within(standing).getByText("200 points behind 1st place.")).toBeTruthy();
    expect(within(standing).getByText("40 points behind 2nd place.")).toBeTruthy();
    expect(
      screen.getByText(
        "Scoring: a top earns the route's points, less 20% for each failed attempt before it, within 5 attempts.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it("shows what the assistant uses, with other Climbers only as places", async () => {
    open();

    fireEvent.click(await screen.findByText("What the assistant uses"));

    expect(
      screen.getByText("Route 3 (V5): 300 points if you top it on your next attempt, 5 attempts left."),
    ).toBeTruthy();
    expect(screen.getByText("Route 1, Crimp Ladder (V2): topped in 3 attempts, 60 points.")).toBeTruthy();
    expect(screen.getByText("Route 2 (V3): flashed, 200 points.")).toBeTruthy();
    expect(screen.getByText("Route 5 (V6): no attempts left.")).toBeTruthy();
    expect(screen.getByText("3rd place: 260 points (you).")).toBeTruthy();
    expect(screen.getByText("4th place: 0 points, shared by 2 Climbers.")).toBeTruthy();
  });

  it("fills in a suggested question, sends only the question, and shows the answer with its routes", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Which route should I try next?" }));

    expect(field().value).toBe("Which route should I try next?");
    expect(document.activeElement).toBe(field());
    fireEvent.change(field(), { target: { value: "  Which route should   I try next?  " } });
    fireEvent.click(askButton());

    expect(screen.getByRole("button", { name: "Asking…" })).toBeTruthy();
    expect(screen.getByText("Working on your answer from your results and the current standings…")).toBeTruthy();
    expect(screen.getAllByRole("status").map((status) => status.textContent)).toContain("Working on your answer.");
    await screen.findByText("Try Route 4 next. A top on your next attempt is worth 120 points.");
    expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({ question: "Which route should I try next?" });
    expect(screen.getByText("An answer is ready.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "The assistant's answer" }));
    expect(screen.getByText("Route 3 is worth more, but only 2 Climbers have tried it.")).toBeTruthy();
    const routes = within(
      screen.getByRole("heading", { name: "Recommended routes, best first" }).parentElement as HTMLElement,
    ).getAllByRole("listitem");
    expect(routes.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "Route 4, Blue Roof (V4)",
      "Route 3 (V5)",
    ]);
    expect(within(routes[0]).getByText("120 points if you top it on your next attempt")).toBeTruthy();
    expect(within(routes[0]).getByText("From 4 Climbers' results.")).toBeTruthy();
    expect(within(routes[1]).getByText("Only 2 Climbers' results so far, too few to compare reliably.")).toBeTruthy();
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    expect(within(section("The assistant's answer")).getByText(NOTICE)).toBeTruthy();
  });

  it("replaces the answer with each new question", async () => {
    open();
    await ask();
    await screen.findByText("Try Route 4 next. A top on your next attempt is worth 120 points.");
    answer = {
      ...answered,
      question: "How far am I from 1st place?",
      answer: "You're 200 points behind 1st place.",
      recommendedRoutes: [],
    };

    await ask("How far am I from 1st place?");

    await screen.findByText("You're 200 points behind 1st place.");
    expect(screen.queryByText("Try Route 4 next. A top on your next attempt is worth 120 points.")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Recommended route/ })).toBeNull();
    expect(
      screen.getByText(
        (_, element) => element?.tagName === "P" && element.textContent === "You asked: How far am I from 1st place?",
      ),
    ).toBeTruthy();
  });

  it("shows an answer as text, never as HTML, and says when it was cut short", async () => {
    answer = {
      ...answered,
      answer: '<img src="x" onerror="alert(1)"> Try Route 4.',
      truncated: true,
      recommendedRoutes: [],
    };
    const { container } = open();

    await ask();

    await screen.findByText('<img src="x" onerror="alert(1)"> Try Route 4.');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText("This answer was cut short. Ask a more specific question for more detail.")).toBeTruthy();
  });

  it("keeps Ask assistant off until the question can be sent", async () => {
    open();
    await screen.findByRole("textbox", { name: "Your question" });

    expect(askButton().disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "ab" } });
    expect(screen.getByText("Use 3 to 300 characters.")).toBeTruthy();
    fireEvent.change(field(), { target: { value: "???" } });
    expect(screen.getByText("Enter a question about the routes or your ranking.")).toBeTruthy();
    expect(askButton().disabled).toBe(true);
    fireEvent.change(field(), { target: { value: "Which route next?" } });
    expect(askButton().disabled).toBe(false);
    expect(field().maxLength).toBe(300);
  });

  it("explains why the Climber can't ask, and still shows their standing", async () => {
    availability = {
      ...ready,
      enabled: false,
      canAsk: false,
      reasons: ["The Route Assistant isn't set up on this server."],
    };
    open();

    await screen.findByText("You can't ask about this competition right now.");

    expect(screen.getByText("The Route Assistant isn't set up on this server.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Your question" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Your standing now" })).toBeTruthy();
  });

  it("says when the competition is over and suggests questions about the final standing", async () => {
    availability = {
      ...ready,
      basedOn: {
        ...basedOn,
        competition: { ...basedOn.competition, finished: true },
        routesToTry: [],
        cantScore: [
          { route: "3", grade: "V5", yourAttempts: 0, reason: "competition is over" },
          { route: "6", grade: "V1", reason: "worth no points" },
        ],
      },
    };
    open();

    await screen.findByText(
      "This competition is over, so there are no routes left to try. You can still ask about your final standing.",
    );
    expect(screen.getByRole("button", { name: "How far was I from 1st place?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Which route should I try next?" })).toBeNull();
    fireEvent.click(screen.getByText("What the assistant uses"));
    expect(screen.getByText("Route 3 (V5): competition is over.")).toBeTruthy();
    expect(screen.getByText("Route 6 (V1): worth no points.")).toBeTruthy();
  });

  it("says when the Climber isn't in the standings yet", async () => {
    availability = {
      ...ready,
      canAsk: false,
      reasons: ["Your place isn't confirmed yet, so the Route Assistant can't advise you on this competition."],
      basedOn: { ...basedOn, you: null, placesAbove: [], divisionPlaces: [] },
    };
    open();

    await screen.findByText("You're not in the standings yet. Only Climbers with a confirmed place are ranked.");
    expect(
      screen.getByText("Your place isn't confirmed yet, so the Route Assistant can't advise you on this competition."),
    ).toBeTruthy();
  });

  it.each([
    [
      failure(
        429,
        "TOO_MANY_REQUESTS",
        "You've asked the Route Assistant a lot of questions this hour. Try again later.",
      ),
      "You've asked the Route Assistant a lot of questions this hour. Try again later.",
    ],
    [
      failure(503, "ROUTE_ASSISTANT_BUSY", "The Route Assistant is busy right now. Try again in a minute."),
      "The Route Assistant is busy right now. Try again in a minute.",
    ],
    [
      failure(503, "ROUTE_ASSISTANT_UNAVAILABLE", "Unavailable."),
      "The Route Assistant isn't available right now. Your results are unchanged. Try again later.",
    ],
    [
      failure(502, "ROUTE_ASSISTANT_BAD_RESPONSE", "Bad answer."),
      "The Route Assistant's answer couldn't be used. Try asking again.",
    ],
    [
      failure(422, "ROUTE_ASSISTANT_DECLINED", "Declined."),
      "The Route Assistant couldn't answer that question. Ask which route to try next or how far you are from a place.",
    ],
    [
      Response.json({ ...answered, competition: { ...answered.competition, _id: "507f1f77bcf86cd799439099" } }),
      "Couldn't get an answer. Please try again.",
    ],
  ])("explains a question that couldn't be answered (%#)", async (reply, message) => {
    answer = reply;
    open();

    await ask();

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(field().value).toBe("Which route should I try next?");
    expect(askButton().disabled).toBe(false);
  });

  it("shows the API's message for the question under the field", async () => {
    answer = failure(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
      question: "Remove the special characters from your question.",
    });
    open();

    await ask();

    expect((await screen.findByRole("alert")).textContent).toBe("Remove the special characters from your question.");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("heading", { name: "The assistant's answer" })).toBeNull();
  });

  it("reloads why the Climber can't ask after a 409", async () => {
    answer = failure(409, "COMPETITION_CANCELLED", "This competition was cancelled.");
    open();
    await screen.findByRole("textbox", { name: "Your question" });
    availability = { ...ready, canAsk: false, reasons: ["This competition was cancelled."] };

    fireEvent.click(screen.getByRole("button", { name: "Which route should I try next?" }));
    fireEvent.click(askButton());

    await screen.findByText("You can't ask about this competition right now.");
    expect(gets()).toHaveLength(2);
    expect(screen.getAllByText("This competition was cancelled.")).toHaveLength(2);
  });

  it("stops when the Climber's access is lost", async () => {
    answer = failure(
      404,
      "REGISTRATION_NOT_FOUND",
      "You're not registered for this competition, so the Route Assistant can't advise you on it.",
    );
    open();

    await ask();

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText(
        "You're not registered for this competition, so the Route Assistant can't advise you on it.",
      ),
    ).toBeTruthy();
    expect(within(alert).queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Your question" })).toBeNull();
  });

  it("offers to sign in again when the session ended", async () => {
    fetchMock.mockImplementation(async () => failure(401, "UNAUTHORIZED", "Sign in."));
    open();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Your session has ended. Sign in again to continue.")).toBeTruthy();
    expect(within(alert).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("tries loading again after a failure", async () => {
    fetchMock.mockImplementationOnce(async () => failure(500, "INTERNAL_ERROR", "Something went wrong."));
    open();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await screen.findByRole("heading", { name: "Your standing now" });
    expect(gets()).toHaveLength(2);
  });

  it("refreshes the standings and clears the last answer", async () => {
    open();
    await ask();
    await screen.findByText("Try Route 4 next. A top on your next attempt is worth 120 points.");
    availability = {
      ...ready,
      basedOn: {
        ...basedOn,
        you: { ...basedOn.you!, place: 2, totalScore: 380, pointsBehindLeader: 80 },
        placesAbove: [{ place: 1, totalScore: 460, pointsToTie: 80 }],
      },
    };

    fireEvent.click(screen.getByRole("button", { name: "Refresh standings" }));

    await screen.findByText("80 points behind 1st place.");
    expect(screen.queryByText("Try Route 4 next. A top on your next attempt is worth 120 points.")).toBeNull();
    expect(gets()).toHaveLength(2);
  });

  it("aborts the question when the Climber leaves the page", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method !== "POST") return Response.json(availability);
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = open();
    await ask();
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
