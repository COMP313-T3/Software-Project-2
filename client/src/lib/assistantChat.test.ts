import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_HISTORY_SENT,
  CHAT_MESSAGES_KEPT,
  chatText,
  conversationKey,
  forgetConversations,
  historyOf,
  readConversation,
  rememberWelcome,
  saveConversation,
  wasWelcomed,
  type ChatMessage,
  type ChatPlace,
} from "./assistantChat.ts";

const SCORECARD: ChatPlace = { audience: "climber", page: "scorecard" };
const LEADERBOARD: ChatPlace = { audience: "climber", page: "leaderboard" };
const STATISTICS: ChatPlace = { audience: "gym-admin", page: "route-statistics" };

const message = (id: number, role: ChatMessage["role"] = "user"): ChatMessage => ({ id, role, text: `message ${id}` });

beforeEach(() => {
  window.localStorage.clear();
  forgetConversations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AC-022 what the chatbot says on each page", () => {
  it("suggests the scorecard questions on My scorecard", () => {
    expect(chatText(SCORECARD).suggestions).toEqual([
      "Which route should I try next?",
      "Which unfinished route has the best completion rate?",
      "What route looks the easiest?",
      "Explain my scorecard.",
    ]);
    expect(chatText(SCORECARD).pageName).toBe("My scorecard");
  });

  it("suggests the ranking questions on the Climber's leaderboard", () => {
    expect(chatText(LEADERBOARD).suggestions).toEqual([
      "How far am I from the next rank?",
      "What is my current ranking?",
      "How many points separate me from rank 3?",
      "Explain the leaderboard to me.",
    ]);
  });

  it("suggests the route statistics questions on Route statistics", () => {
    expect(chatText(STATISTICS).suggestions).toEqual([
      "Which route was the hardest?",
      "Which route had the lowest completion rate?",
      "Which route had the highest flash rate?",
      "Summarize the route statistics.",
    ]);
  });

  it.each([
    [{ audience: "gym-admin", page: "results" }, "Result entry", "Which route took the most attempts?"],
    [{ audience: "gym-admin", page: "leaderboard" }, "Live leaderboard", "How close is the race in each division?"],
  ] as const)("has its own questions for %j", (place, pageName, first) => {
    const text = chatText(place);

    expect(text.pageName).toBe(pageName);
    expect(text.suggestions).toHaveLength(4);
    expect(text.suggestions[0]).toBe(first);
  });

  it.each([
    SCORECARD,
    LEADERBOARD,
    STATISTICS,
    { audience: "gym-admin", page: "results" },
    { audience: "gym-admin", page: "leaderboard" },
  ] as const)("welcomes with what it knows, what to ask and what it can't do on %j", (place) => {
    const { welcome, intro } = chatText(place);

    expect(welcome).toHaveLength(3);
    expect(welcome[0]).toMatch(/^It already knows this competition/);
    expect(welcome[1]).toContain(intro.replace(/\.$/, ""));
    expect(welcome[1]).toContain("Choose a suggested question to send it, or type your own.");
    expect(welcome[2]).toMatch(/It can't change scores, results(,| or) rankings/);
  });

  it("tells a Gym Admin it never names a Climber", () => {
    expect(chatText(STATISTICS).welcome[2]).toContain("it never names a Climber");
  });
});

describe("AC-022 the conversation while the user stays in TopSend", () => {
  it("keeps each user's conversation about a competition on a kind of page apart", () => {
    const mine = conversationKey("climber-one", SCORECARD, "competition-a");
    saveConversation(mine, [message(1), message(2, "assistant")]);

    expect(readConversation(mine)).toEqual([message(1), message(2, "assistant")]);
    expect(readConversation(conversationKey("climber-two", SCORECARD, "competition-a"))).toEqual([]);
    expect(readConversation(conversationKey("climber-one", LEADERBOARD, "competition-a"))).toEqual([]);
    expect(readConversation(conversationKey("climber-one", SCORECARD, "competition-b"))).toEqual([]);
  });

  it("keeps it in memory only, never in the browser's storage", () => {
    saveConversation(conversationKey("climber-one", SCORECARD, "competition-a"), [message(1)]);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("drops the oldest messages of a long conversation", () => {
    const key = conversationKey("climber-one", SCORECARD, "competition-a");
    saveConversation(
      key,
      Array.from({ length: CHAT_MESSAGES_KEPT + 5 }, (_item, index) => message(index + 1)),
    );

    const kept = readConversation(key);
    expect(kept).toHaveLength(CHAT_MESSAGES_KEPT);
    expect(kept[0].id).toBe(6);
  });

  it("sends the latest messages as the earlier conversation, with only who said what", () => {
    const messages = Array.from({ length: CHAT_HISTORY_SENT + 3 }, (_item, index) => ({
      ...message(index + 1, index % 2 ? "assistant" : "user"),
      truncated: true,
    }));

    const history = historyOf(messages);

    expect(history).toHaveLength(CHAT_HISTORY_SENT);
    expect(history[0]).toEqual({ role: "assistant", text: "message 4" });
    expect(history.at(-1)).toEqual({ role: "user", text: `message ${CHAT_HISTORY_SENT + 3}` });
  });
});

describe("AC-022 the first-time welcome", () => {
  it("is remembered for a user on a kind of page", () => {
    expect(wasWelcomed("climber-one", SCORECARD)).toBe(false);

    rememberWelcome("climber-one", SCORECARD);

    expect(wasWelcomed("climber-one", SCORECARD)).toBe(true);
    expect(wasWelcomed("climber-one", LEADERBOARD)).toBe(false);
    expect(wasWelcomed("climber-two", SCORECARD)).toBe(false);
    expect(wasWelcomed("climber-one", STATISTICS)).toBe(false);
  });

  it("is remembered in the browser, so a reload doesn't show it again", () => {
    rememberWelcome("climber-one", SCORECARD);
    rememberWelcome("climber-one", SCORECARD);
    rememberWelcome("climber-one", LEADERBOARD);
    forgetConversations();

    expect(wasWelcomed("climber-one", SCORECARD)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("topsend.assistant.welcomed") ?? "[]")).toEqual([
      "climber-one:climber:scorecard",
      "climber-one:climber:leaderboard",
    ]);
  });

  it("is still shown only once when the browser's storage can't be used", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(wasWelcomed("climber-one", SCORECARD)).toBe(false);
    rememberWelcome("climber-one", SCORECARD);

    expect(wasWelcomed("climber-one", SCORECARD)).toBe(true);
  });

  it("ignores a stored value that isn't a list", () => {
    window.localStorage.setItem("topsend.assistant.welcomed", '{"climber-one:climber:scorecard":true}');

    expect(wasWelcomed("climber-one", SCORECARD)).toBe(false);
  });
});
