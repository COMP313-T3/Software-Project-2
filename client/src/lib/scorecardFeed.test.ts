import { waitFor } from "@testing-library/react";
import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient.ts";
import { getScorecard } from "./scorecardApi.ts";
import { followScorecard, liveProblem, scorecardSocketUrl, type ScorecardState } from "./scorecardFeed.ts";
import { getRealtimeAccessToken } from "./sessionClient.ts";
import { SCORECARD_COMPETITION as id, scorecardFixture, sentProblemThree } from "../test/scorecardFixtures.ts";

vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("./scorecardApi.ts", async (original) => ({
  ...(await original<typeof import("./scorecardApi.ts")>()),
  getScorecard: vi.fn(),
}));
vi.mock("./sessionClient.ts", () => ({ getRealtimeAccessToken: vi.fn() }));

type Handler = (...args: unknown[]) => void;

class Events {
  handlers = new Map<string, Handler>();
  on(event: string, handler: Handler) {
    this.handlers.set(event, handler);
    return this;
  }
  receive(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
}

interface SocketSetup {
  joinAnswer: unknown;
  joinTimesOut: boolean;
  connectError: unknown;
}

class FakeSocket extends Events {
  io = new Events();
  connected = false;
  id = "connection-1";
  sent: { event: string; payload: unknown }[] = [];
  credentials: unknown = null;
  readonly url: string;
  readonly options: { auth: (callback: (value: unknown) => void) => void };
  readonly setup: SocketSetup;

  constructor(url: string, options: FakeSocket["options"], setup: SocketSetup) {
    super();
    this.url = url;
    this.options = options;
    this.setup = setup;
  }

  connect() {
    this.options.auth((value) => {
      this.credentials = value;
      if (this.setup.connectError) {
        this.receive("connect_error", Object.assign(new Error("refused"), { data: this.setup.connectError }));
        return;
      }
      this.connected = true;
      this.receive("connect");
    });
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  emit(event: string, payload: unknown) {
    this.sent.push({ event, payload });
    return this;
  }

  timeout() {
    return {
      emit: (event: string, payload: unknown, ack: Handler) => {
        this.emit(event, payload);
        if (this.setup.joinTimesOut) ack(new Error("operation has timed out"));
        else ack(null, this.setup.joinAnswer);
      },
    };
  }
}

let sockets: FakeSocket[];
let states: ScorecardState[];
let setup: SocketSetup;
const feeds: ReturnType<typeof followScorecard>[] = [];
const state = () => states.at(-1)!;
const otherCompetition = "507f1f77bcf86cd799439099";
const notRegistered = {
  error: "REGISTRATION_NOT_FOUND",
  message: "You're not registered for this competition, so you don't have a scorecard for it.",
};
const notStarted = {
  error: "COMPETITION_NOT_STARTED",
  message: "This competition starts on November 21, 2026 at 10:00 a.m. Your scorecard and the leaderboard open then.",
  details: { startsAt: "2026-11-21T15:00:00.000Z" },
};

function begin() {
  const feed = followScorecard(id, (value) => states.push(value));
  feeds.push(feed);
  return feed;
}

async function ready() {
  await waitFor(() => expect(state()?.live).toBe("live"));
  return sockets.at(-1)!;
}

beforeEach(() => {
  sockets = [];
  states = [];
  setup = { joinAnswer: { ok: true, scorecard: scorecardFixture() }, joinTimesOut: false, connectError: null };
  vi.mocked(getScorecard).mockReset().mockResolvedValue(scorecardFixture());
  vi.mocked(getRealtimeAccessToken).mockReset().mockResolvedValue("memory-token");
  vi.mocked(io)
    .mockReset()
    .mockImplementation(((url: string, options: FakeSocket["options"]) => {
      const socket = new FakeSocket(url, options, { ...setup });
      sockets.push(socket);
      return socket;
    }) as never);
});

afterEach(() => {
  feeds.splice(0).forEach((feed) => feed.close());
  vi.restoreAllMocks();
});

describe("US-031 live scorecard", () => {
  it("reads the scorecard first, then joins only this competition's live scorecard with the login token", async () => {
    begin();
    const socket = await ready();

    expect(getScorecard).toHaveBeenCalledWith(id, expect.any(AbortSignal));
    expect(vi.mocked(getScorecard).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(io).mock.invocationCallOrder[0]);
    expect(socket.url).toBe("/scorecard");
    expect(socket.credentials).toEqual({ token: "memory-token" });
    expect(socket.sent).toEqual([{ event: "scorecard:join", payload: { competitionId: id } }]);
    expect(state()).toMatchObject({ scorecard: scorecardFixture(), error: null, refreshing: false, changed: [] });
  });

  it("replaces the scorecard with each update and points out the problem that changed", async () => {
    begin();
    const socket = await ready();

    socket.receive("scorecard:update", { competitionId: id, reason: "RESULT", scorecard: sentProblemThree() });

    expect(state().scorecard?.summary.totalScore).toBe(1220);
    expect(state().scorecard?.routes.find((route) => route.routeId === "route-3")?.status).toBe("SENT");
    expect(state().changed).toEqual(["route-3"]);
  });

  it("never adds anything twice and ignores older updates and other competitions", async () => {
    begin();
    const socket = await ready();
    socket.receive("scorecard:update", { competitionId: id, scorecard: sentProblemThree() });
    const count = states.length;

    socket.receive("scorecard:update", { competitionId: id, scorecard: sentProblemThree("2026-11-09T06:40:00.000Z") });
    socket.receive("scorecard:update", { competitionId: id, scorecard: scorecardFixture() });
    socket.receive("scorecard:update", { competitionId: otherCompetition, scorecard: scorecardFixture() });
    socket.receive("scorecard:closed", { competitionId: otherCompetition, ...notRegistered });

    expect(states).toHaveLength(count);
    expect(state().scorecard?.routes).toHaveLength(5);
    expect(state().live).toBe("live");
  });

  it("goes offline without showing an update that doesn't match the competition's scorecard", async () => {
    begin();
    const socket = await ready();
    const foreign = sentProblemThree();
    foreign.competition._id = otherCompetition;

    socket.receive("scorecard:update", { competitionId: id, scorecard: foreign });

    expect(state().live).toBe("offline");
    expect(state().scorecard?.summary.totalScore).toBe(860);
  });

  it("clears the private scorecard when the server closes it, such as after the registration is removed", async () => {
    begin();
    const socket = await ready();

    socket.receive("scorecard:closed", { competitionId: id, ...notRegistered });

    expect(state()).toMatchObject({ scorecard: null, live: "offline", refreshing: false, changed: [] });
    expect(state().error).toMatchObject({ status: 404, code: "REGISTRATION_NOT_FOUND", message: notRegistered.message });
    expect(socket.connected).toBe(false);
  });

  it("stops when joining is refused", async () => {
    setup.joinAnswer = { ok: false, error: notRegistered };
    begin();

    await waitFor(() => expect(state().live).toBe("offline"));

    expect(state().scorecard).toBeNull();
    expect(state().error).toMatchObject({ status: 404 });
  });

  it("renews an expired login once and reconnects", async () => {
    begin();
    const first = await ready();

    first.receive("connect_error", Object.assign(new Error("refused"), { data: { error: "TOKEN_EXPIRED", message: "Expired." } }));

    await waitFor(() => expect(sockets).toHaveLength(2));
    await ready();
    expect(getRealtimeAccessToken).toHaveBeenCalledWith(true);
    expect(state().scorecard).toEqual(scorecardFixture());
  });

  it("gives up when the renewed login is refused too", async () => {
    begin();
    const first = await ready();
    setup.connectError = { error: "TOKEN_EXPIRED", message: "Expired." };

    first.receive("connect_error", Object.assign(new Error("refused"), { data: { error: "TOKEN_EXPIRED" } }));

    await waitFor(() => expect(state().live).toBe("offline"));
    expect(sockets).toHaveLength(2);
    expect(state().scorecard).toBeNull();
    expect(state().error).toMatchObject({ status: 401 });
  });

  it("keeps the last scorecard while reconnecting and after reconnecting fails", async () => {
    begin();
    const socket = await ready();

    socket.receive("disconnect");
    expect(state().live).toBe("reconnecting");

    socket.io.receive("reconnect_failed");
    expect(state().live).toBe("offline");
    expect(state().error).toMatchObject({ code: "LIVE_UNAVAILABLE" });
    expect(state().scorecard).toEqual(scorecardFixture());
  });

  it("keeps the scorecard and goes offline when joining times out", async () => {
    setup.joinTimesOut = true;
    begin();

    await waitFor(() => expect(state().live).toBe("offline"));

    expect(state().scorecard).toEqual(scorecardFixture());
    expect(state().error).toMatchObject({ code: "LIVE_UNAVAILABLE" });
  });

  it("doesn't connect when the scorecard can't be read, and clears it when it is refused", async () => {
    vi.mocked(getScorecard).mockRejectedValue(new ApiError(404, "REGISTRATION_NOT_FOUND", notRegistered.message));
    begin();

    await waitFor(() => expect(state().refreshing).toBe(false));

    expect(io).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ scorecard: null, live: "offline" });
  });

  it("waits without connecting while the competition hasn't started, keeping its start, then opens when asked again", async () => {
    vi.mocked(getScorecard).mockRejectedValueOnce(
      new ApiError(409, notStarted.error, notStarted.message, undefined, notStarted.details),
    );
    const feed = begin();
    await waitFor(() => expect(state().refreshing).toBe(false));

    expect(io).not.toHaveBeenCalled();
    expect(state().scorecard).toBeNull();
    expect(state().error).toMatchObject({ status: 409, code: "COMPETITION_NOT_STARTED", details: notStarted.details });

    await feed.reconnect();

    await ready();
    expect(state().scorecard).toEqual(scorecardFixture());
    expect(state().error).toBeNull();
  });

  it("clears the scorecard and keeps the new start when the start is moved later while it's open", async () => {
    begin();
    const socket = await ready();

    socket.receive("scorecard:closed", { competitionId: id, ...notStarted });

    expect(state()).toMatchObject({ scorecard: null, live: "offline", refreshing: false });
    expect(state().error).toMatchObject({
      status: 409,
      code: "COMPETITION_NOT_STARTED",
      message: notStarted.message,
      details: notStarted.details,
    });
    expect(socket.connected).toBe(false);
  });

  it("can try again after a network failure", async () => {
    vi.mocked(getScorecard).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Network error."));
    const feed = begin();
    await waitFor(() => expect(state().refreshing).toBe(false));
    expect(io).not.toHaveBeenCalled();
    expect(state().error).toMatchObject({ code: "NETWORK_ERROR" });

    await feed.reconnect();

    await ready();
    expect(state().error).toBeNull();
  });

  it("reads again on refresh and points out what changed since", async () => {
    const feed = begin();
    await ready();
    vi.mocked(getScorecard).mockResolvedValue(sentProblemThree());

    await feed.refresh();

    expect(getScorecard).toHaveBeenCalledTimes(2);
    expect(state()).toMatchObject({ refreshing: false, changed: ["route-3"] });
    expect(sockets).toHaveLength(1);
  });

  it("shows the scorecard a save answered, points out the change, and adds nothing when the live update repeats it", async () => {
    const feed = begin();
    const socket = await ready();

    feed.apply(sentProblemThree());
    const count = states.length;
    socket.receive("scorecard:update", { competitionId: id, scorecard: sentProblemThree("2026-11-09T06:26:00.000Z") });

    expect(state()).toMatchObject({ error: null, changed: ["route-3"] });
    expect(state().scorecard?.summary.totalScore).toBe(1220);
    expect(states).toHaveLength(count);
  });

  it("ignores a saved scorecard after closing", async () => {
    const feed = begin();
    await ready();
    const count = states.length;

    feed.close();
    feed.apply(sentProblemThree());

    expect(states).toHaveLength(count);
  });

  it("leaves the scorecard and ignores everything after closing", async () => {
    const feed = begin();
    const socket = await ready();
    const count = states.length;

    feed.close();
    socket.receive("scorecard:update", { competitionId: id, scorecard: sentProblemThree() });

    expect(socket.sent.at(-1)).toEqual({ event: "scorecard:leave", payload: { competitionId: id } });
    expect(socket.connected).toBe(false);
    expect(states).toHaveLength(count);
  });
});

describe("live scorecard addresses and refusals", () => {
  it("uses the page's own origin, or the API's when it is elsewhere", () => {
    expect(scorecardSocketUrl("")).toBe("/scorecard");
    expect(scorecardSocketUrl("https://api.topsend.example/api")).toBe("https://api.topsend.example/scorecard");
  });

  it("gives each refusal the status the same refusal has over HTTP", () => {
    expect(liveProblem({ error: "SESSION_EXPIRED" })).toMatchObject({ status: 401 });
    expect(liveProblem({ error: "SCORECARD_FORBIDDEN", message: "That isn't your scorecard." })).toMatchObject({
      status: 403,
      message: "That isn't your scorecard.",
    });
    expect(liveProblem(notRegistered)).toMatchObject({ status: 404, message: notRegistered.message });
    expect(liveProblem({ error: "INTERNAL_ERROR", message: "stack trace" })).toMatchObject({
      status: 0,
      message: "Live updates are unavailable. Refresh your scorecard or reconnect.",
    });
    expect(liveProblem(undefined)).toMatchObject({ status: 0, code: "LIVE_UNAVAILABLE" });
    expect(liveProblem(notStarted)).toMatchObject({ status: 409, message: notStarted.message, details: notStarted.details });
  });
});
