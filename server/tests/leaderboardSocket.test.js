import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLeaderboardRealtime, roomFor } from "../src/realtime/leaderboardSocket.js";
import * as boards from "../src/services/leaderboardService.js";
import { leaderboardChanged } from "../src/services/leaderboardEvents.js";
import { AppError } from "../src/utils/AppError.js";
import { logger } from "../src/utils/logger.js";
vi.mock("../src/services/leaderboardService.js", () => ({ calculateLeaderboard: vi.fn(), leaderboardAccess: vi.fn(), presentLeaderboard: vi.fn() }));
const competitionId = "507f1f77bcf86cd799439011", otherId = "507f1f77bcf86cd799439012";
let http, server, namespace, realtime, origin, publicEnabled, assigned, registered, sessionActive, clients, auth;
function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, done); reject(new Error("Missing socket event: " + event)); }, 2500);
    function done(value) { clearTimeout(timer); resolve(value); }
    socket.once(event, done);
  });
}
async function client(token) {
  const socket = connect(origin + "/leaderboard", { forceNew: true, autoConnect: false, transports: ["websocket"], reconnection: false, auth: token ? { token } : {} });
  clients.push(socket); const connected = once(socket, "connect"); socket.connect(); await connected; return socket;
}
const join = (socket, id = competitionId) => socket.timeout(2000).emitWithAck("leaderboard:join", { competitionId: id });
beforeEach(async () => {
  publicEnabled = assigned = registered = sessionActive = true; clients = [];
  vi.spyOn(logger, "info").mockImplementation(() => {}); vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.mocked(boards.calculateLeaderboard).mockReset().mockImplementation(async id => ({ board: { competitionId: id }, isPublic: publicEnabled }));
  vi.mocked(boards.leaderboardAccess).mockReset().mockImplementation(async viewer => {
    if (viewer?.role === "GYM_ADMIN" && assigned) return { audience: "manage" };
    if (viewer?.role === "CLIMBER" && registered) return { audience: "climber", climberId: viewer.userId };
    if (!publicEnabled) throw new AppError(403, "LEADERBOARD_NOT_PUBLIC", "Public viewing is off.");
    return { audience: "public" };
  });
  vi.mocked(boards.presentLeaderboard).mockReset().mockImplementation((board, access) => ({ ...board, audience: access.audience, ...(access.climberId ? { myEntry: access.climberId } : {}) }));
  auth = {
    accessTokens: { verify: vi.fn(async token => {
      if (!["judge", "climber"].includes(token)) throw new AppError(401, "NOT_AUTHENTICATED", "Sign in.");
      return { userId: token, role: token === "judge" ? "GYM_ADMIN" : "CLIMBER", sessionId: "session" };
    }) },
    sessions: { findActive: vi.fn(async () => { if (!sessionActive) throw new AppError(401, "SESSION_EXPIRED", "Sign in again."); }) },
  };
  http = createServer(); server = new Server(http); namespace = server.of("/leaderboard");
  realtime = createLeaderboardRealtime({ namespace, auth, delayMs: 10 });
  await new Promise(resolve => http.listen(0, "127.0.0.1", resolve)); origin = "http://127.0.0.1:" + http.address().port;
});
afterEach(async () => {
  clients.forEach(socket => socket.disconnect()); realtime.close(); await new Promise(resolve => server.close(resolve)); vi.restoreAllMocks();
});
describe("US-020 real Socket.IO transport / FR-011 / AC-016", () => {
  it.each([[undefined, "public"], ["judge", "manage"], ["climber", "climber"]])("joins the authorized audience with a current snapshot (%s)", async (token, audience) => {
    const socket = await client(token), answer = await join(socket);
    expect(answer.ok).toBe(true); expect(answer.leaderboard).toMatchObject({ competitionId, audience });
    expect(namespace.adapter.rooms.get(roomFor(competitionId, audience))?.has(socket.id)).toBe(true);
    if (token === "climber") expect(answer.leaderboard.myEntry).toBe("climber");
  });
  it("refuses an invalid token before joining a room", async () => {
    const socket = connect(origin + "/leaderboard", { autoConnect: false, reconnection: false, auth: { token: "forged" } }); clients.push(socket);
    const failed = once(socket, "connect_error"); socket.connect(); expect((await failed).data.error).toBe("NOT_AUTHENTICATED"); expect(boards.calculateLeaderboard).not.toHaveBeenCalled();
  });
  it("refuses a private board to a Visitor", async () => {
    publicEnabled = false; const socket = await client(); const answer = await join(socket);
    expect(answer).toMatchObject({ ok: false, error: { error: "LEADERBOARD_NOT_PUBLIC" } }); expect(namespace.adapter.rooms.has(roomFor(competitionId, "public"))).toBe(false);
  });
  it("sends updates only to the selected competition and each audience's own view", async () => {
    const judge = await client("judge"), climber = await client("climber"), other = await client();
    await join(judge); await join(climber); await join(other, otherId); const unrelated = vi.fn(); other.on("leaderboard:update", unrelated);
    const a = once(judge, "leaderboard:update"), b = once(climber, "leaderboard:update"); await realtime.sendUpdate(competitionId, "RESULT");
    expect((await a).leaderboard.audience).toBe("manage"); expect((await b).leaderboard.myEntry).toBe("climber"); expect(unrelated).not.toHaveBeenCalled();
  });
  it("batches result changes and calculates nothing for unobserved competitions", async () => {
    const socket = await client("judge"); await join(socket); vi.mocked(boards.calculateLeaderboard).mockClear();
    await realtime.sendUpdate(otherId); expect(boards.calculateLeaderboard).not.toHaveBeenCalled();
    const updated = once(socket, "leaderboard:update"); leaderboardChanged(competitionId, "RESULT"); leaderboardChanged(competitionId, "RESULT"); leaderboardChanged(competitionId, "RESULT");
    await updated; expect(boards.calculateLeaderboard).toHaveBeenCalledTimes(1);
  });
  it.each([["judge", "assignment"], ["climber", "registration"]])("stops sending private updates after %s loses %s", async token => {
    const socket = await client(token); await join(socket); const updates = vi.fn(); socket.on("leaderboard:update", updates);
    assigned = registered = false; const closed = once(socket, "leaderboard:closed"); await realtime.sendUpdate(competitionId);
    expect((await closed).error).toBe("LEADERBOARD_ACCESS_LOST"); expect(updates).not.toHaveBeenCalled(); expect(namespace.adapter.rooms.has(roomFor(competitionId, token === "judge" ? "manage" : "climber"))).toBe(false);
  });
  it("rechecks active sessions before another private push", async () => {
    const socket = await client("judge"); await join(socket); sessionActive = false;
    const closed = once(socket, "leaderboard:closed"); await realtime.sendUpdate(competitionId); expect((await closed).error).toBe("SESSION_EXPIRED");
  });
  it("closes a public room when public access is switched off", async () => {
    const socket = await client(); await join(socket); publicEnabled = false;
    const closed = once(socket, "leaderboard:closed"); await realtime.sendUpdate(competitionId); expect((await closed).error).toBe("LEADERBOARD_NOT_PUBLIC");
  });
  it("leaves the old competition and rejoins after a transport reconnect", async () => {
    const socket = await client("judge"); await join(socket); await socket.timeout(2000).emitWithAck("leaderboard:leave", { competitionId });
    expect(namespace.adapter.rooms.has(roomFor(competitionId, "manage"))).toBe(false);
    socket.disconnect(); const connected = once(socket, "connect"); socket.connect(); await connected; expect((await join(socket)).ok).toBe(true);
  });
});
