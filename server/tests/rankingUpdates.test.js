import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEADERBOARD_EVENTS } from "../src/constants/leaderboard.js";
import { Competition } from "../src/models/Competition.js";
import { createLeaderboardRealtime } from "../src/realtime/leaderboardSocket.js";
import { LEADERBOARD_CHANGE, leaderboardChanged } from "../src/services/leaderboardEvents.js";
import { AppError } from "../src/utils/AppError.js";
import { logger } from "../src/utils/logger.js";
import {
  CLIMBERS,
  COMPETITION,
  OTHER_COMPETITION,
  ROUTE_200,
  ROUTE_300,
  installStandingsDatabase,
  result,
  standingsData,
} from "./helpers/standingsDatabase.js";

const TOKENS = Object.freeze({
  "sam-token": CLIMBERS.sam,
  "kim-token": CLIMBERS.kim,
  "pat-token": CLIMBERS.pat,
  "una-token": CLIMBERS.una,
});

let data;
let http;
let server;
let realtime;
let origin;
let sockets;

function next(socket, event, wait = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, done);
      reject(new Error(`No ${event} within ${wait} ms`));
    }, wait);
    function done(message) {
      clearTimeout(timer);
      resolve(message);
    }
    socket.once(event, done);
  });
}

function received(socket, event) {
  const messages = [];
  socket.on(event, (message) => messages.push(message));
  return messages;
}

async function viewer(token) {
  const socket = connect(`${origin}/leaderboard`, {
    forceNew: true,
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    auth: token ? { token } : {},
  });
  sockets.push(socket);
  const connected = next(socket, "connect");
  socket.connect();
  await connected;
  return socket;
}

async function following(token, competitionId = COMPETITION) {
  const socket = await viewer(token);
  const ack = await socket.timeout(2000).emitWithAck(LEADERBOARD_EVENTS.JOIN, { competitionId });
  expect(ack.ok, JSON.stringify(ack)).toBe(true);
  return { socket, joined: ack.leaderboard };
}

const openRanks = (leaderboard) =>
  leaderboard.divisions
    .find((division) => division.name === "Open")
    .standings.map((entry) => [entry.climber.firstName, entry.rank, entry.totalScore]);

beforeEach(async () => {
  data = standingsData();
  installStandingsDatabase(data);
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  sockets = [];
  const auth = {
    accessTokens: {
      verify: vi.fn(async (token) => {
        const climber = TOKENS[token];
        if (!climber) throw new AppError(401, "NOT_AUTHENTICATED", "Log in to continue.");
        return { userId: climber._id, role: "CLIMBER", sessionId: `${token}-session` };
      }),
    },
    sessions: { findActive: vi.fn(async () => ({})) },
  };
  http = createServer();
  server = new Server(http);
  realtime = createLeaderboardRealtime({
    namespace: server.of("/leaderboard"),
    auth,
    delayMs: 20,
    retryDelayMs: 30,
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${http.address().port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.disconnect();
  realtime.close();
  await new Promise((resolve) => server.close(resolve));
  vi.restoreAllMocks();
});

describe("US-032 #32.2 ranking updates", () => {
  it("gives a Climber the current standings and their own place as soon as they follow", async () => {
    const { joined } = await following("sam-token");

    expect(joined.audience).toBe("climber");
    expect(openRanks(joined)).toEqual([
      ["Alex", 1, 460],
      ["Kim", 2, 260],
      ["Sam", 2, 260],
      ["Lee", 4, 0],
    ]);
    expect(joined.myEntry).toMatchObject({ rank: 2, tied: true, totalScore: 260 });
  });

  it("sends new standings from the latest official results when a result changes", async () => {
    const sam = await following("sam-token");
    const kim = await following("kim-token");
    const samUpdate = next(sam.socket, LEADERBOARD_EVENTS.UPDATE);
    const kimUpdate = next(kim.socket, LEADERBOARD_EVENTS.UPDATE);

    data.results.push(result(CLIMBERS.sam, ROUTE_300, 1, true));
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });

    const [forSam, forKim] = await Promise.all([samUpdate, kimUpdate]);
    expect(forSam).toMatchObject({ competitionId: COMPETITION, reason: "result" });
    expect(openRanks(forSam.leaderboard)).toEqual([
      ["Sam", 1, 560],
      ["Alex", 2, 460],
      ["Kim", 3, 260],
      ["Lee", 4, 0],
    ]);
    expect(forSam.leaderboard.myEntry).toMatchObject({ rank: 1, tied: false, totalScore: 560, placeAbove: null });
    expect(forKim.leaderboard.myEntry).toMatchObject({
      rank: 3,
      tied: false,
      pointsBehindLeader: 300,
      placeAbove: { rank: 2, pointsBehind: 200 },
    });
  });

  it("sends one update with every change when results arrive in a burst", async () => {
    const sam = await following("sam-token");
    const updates = received(sam.socket, LEADERBOARD_EVENTS.UPDATE);

    data.results.push(result(CLIMBERS.sam, ROUTE_300, 3, true));
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });
    data.results.push(result(CLIMBERS.kim, ROUTE_200, 1, true));
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.kim._id });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(updates).toHaveLength(1);
    expect(openRanks(updates[0].leaderboard)).toEqual([
      ["Kim", 1, 460],
      ["Alex", 1, 460],
      ["Sam", 3, 440],
      ["Lee", 4, 0],
    ]);
  });

  it("sends nothing to Climbers following another competition", async () => {
    const sam = await following("sam-token");
    const una = await following("una-token", OTHER_COMPETITION);
    const unaUpdates = received(una.socket, LEADERBOARD_EVENTS.UPDATE);
    const samUpdate = next(sam.socket, LEADERBOARD_EVENTS.UPDATE);

    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });
    await samUpdate;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(unaUpdates).toEqual([]);

    const unaUpdate = next(una.socket, LEADERBOARD_EVENTS.UPDATE);
    leaderboardChanged(OTHER_COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.una._id });
    expect((await unaUpdate).competitionId).toBe(OTHER_COMPETITION);
  });

  it("puts a Climber in the standings when their place is confirmed", async () => {
    const pat = await following("pat-token");
    expect(pat.joined.myEntry).toBeNull();
    expect(pat.joined.myRegistration.status).toBe("WAITLIST");
    const update = next(pat.socket, LEADERBOARD_EVENTS.UPDATE);

    data.registrations.find((row) => row.climberId === CLIMBERS.pat._id).status = "CONFIRMED";
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.REGISTRATION);

    const { leaderboard } = await update;
    expect(leaderboard.myRegistration.status).toBe("CONFIRMED");
    expect(leaderboard.myEntry).toMatchObject({ rank: 4, tied: true, totalScore: 0, of: 5 });
  });

  it("sends a public viewer names and scores only", async () => {
    data.competitions[0].publicLeaderboard = true;
    const visitor = await following(undefined);
    const update = next(visitor.socket, LEADERBOARD_EVENTS.UPDATE);

    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });

    const { leaderboard } = await update;
    expect(leaderboard.audience).toBe("public");
    expect(leaderboard).not.toHaveProperty("myEntry");
    expect(leaderboard).not.toHaveProperty("myRegistration");
    expect(JSON.stringify(leaderboard)).not.toContain(CLIMBERS.sam._id);
  });

  it("tries a failed update again, so a Climber isn't left with old standings", async () => {
    const sam = await following("sam-token");
    const updates = received(sam.socket, LEADERBOARD_EVENTS.UPDATE);
    const closed = received(sam.socket, LEADERBOARD_EVENTS.CLOSED);
    data.results.push(result(CLIMBERS.sam, ROUTE_300, 1, true));
    vi.mocked(Competition.findById).mockImplementationOnce(() => {
      throw new Error("connection to the database was lost");
    });

    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });

    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(logger.error).toHaveBeenCalledWith(
      "Leaderboard update failed",
      expect.objectContaining({ competitionId: COMPETITION, retriesLeft: 2 }),
    );
    expect(updates[0].leaderboard.myEntry).toMatchObject({ rank: 1, totalScore: 560 });
    expect(closed).toEqual([]);
  });

  it("stops trying after the retries and keeps the Climber following", async () => {
    const sam = await following("sam-token");
    const updates = received(sam.socket, LEADERBOARD_EVENTS.UPDATE);
    const working = vi.mocked(Competition.findById).getMockImplementation();
    vi.mocked(Competition.findById).mockImplementation(() => {
      throw new Error("connection to the database was lost");
    });

    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(updates).toEqual([]);

    vi.mocked(Competition.findById).mockImplementation(working);
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
  });

  it("gives a change that arrives while a retry is waiting its own retries", async () => {
    await following("sam-token");
    vi.mocked(Competition.findById).mockImplementation(() => {
      throw new Error("connection to the database was lost");
    });
    const firstFailure = new Promise((resolve) => {
      vi.mocked(logger.error).mockImplementationOnce(() => resolve());
    });

    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });
    await firstFailure;
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.kim._id });

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(4));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(logger.error).toHaveBeenCalledTimes(4);
  });

  it("tries nothing again once the live leaderboard has closed", async () => {
    await following("sam-token");
    const readsBefore = vi.mocked(Competition.findById).mock.calls.length;
    vi.mocked(Competition.findById).mockImplementationOnce(() => ({
      lean: () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("connection to the database was lost")), 60)),
    }));

    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });
    await vi.waitFor(() => expect(Competition.findById).toHaveBeenCalledTimes(readsBefore + 1));
    realtime.close();

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(Competition.findById).toHaveBeenCalledTimes(readsBefore + 1);
  });

  it("gives a Climber who joins again the standings they missed", async () => {
    const first = await following("sam-token");
    first.socket.disconnect();
    data.results.push(result(CLIMBERS.sam, ROUTE_300, 1, true));
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: CLIMBERS.sam._id });

    const again = await following("sam-token");

    expect(again.joined.myEntry).toMatchObject({ rank: 1, totalScore: 560 });
  });
});
