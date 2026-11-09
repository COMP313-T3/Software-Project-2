// Automated tests for two fixes shipped with US-031:
// - live leaderboards (US-020) no longer close every logged-in viewer 15 minutes after connecting,
//   when their access token runs out, and a viewer whose access changes moves to their new view;
// - My Events (US-030) skips a registration whose competition is gone instead of failing, lists
//   upcoming events first, and says whether each gym is active.
// They need no database or network.
// Run from the server folder with:  node --test "test/**/*.test.js"

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { LEADERBOARD_AUDIENCE, LEADERBOARD_EVENTS } from "../src/constants/leaderboard.js";
import { ROLES } from "../src/constants/roles.js";
import { Registration } from "../src/models/Registration.js";
import { createLeaderboardRealtime, roomFor } from "../src/realtime/leaderboardSocket.js";
import { getMyEvents } from "../src/services/myEventsService.js";
import { AppError } from "../src/utils/AppError.js";
import { torontoToday } from "../src/utils/calendarDates.js";
import { fakeAuth, fakeNamespace } from "./helpers/realtimeFakes.js";

const COMPETITION = "6650000000000000000000c1";
const SAM = "6650000000000000000000e1";
const ADMIN = "6650000000000000000000e9";

/** A live leaderboard whose access rules come from the registered and public settings here. */
function leaderboardSetup() {
  const namespace = fakeNamespace();
  const auth = fakeAuth();
  auth.login("sam-token", { userId: SAM, role: ROLES.CLIMBER, sessionId: "6650000000000000000000b1" });
  auth.login("admin-token", { userId: ADMIN, role: ROLES.GYM_ADMIN, sessionId: "6650000000000000000000b9" });
  const state = { registered: new Set([SAM]), isPublic: true, accessChecks: 0, failAccess: false };

  const service = {
    async calculateLeaderboard() {
      return { board: { totals: "standings" }, isPublic: state.isPublic };
    },
    async leaderboardAccess(viewer) {
      state.accessChecks += 1;
      if (state.failAccess) throw new Error("connection to the database was lost");
      if (viewer?.role === ROLES.GYM_ADMIN) return { audience: LEADERBOARD_AUDIENCE.MANAGE };
      if (viewer?.role === ROLES.CLIMBER && state.registered.has(viewer.userId)) {
        return { audience: LEADERBOARD_AUDIENCE.CLIMBER, climberId: viewer.userId };
      }
      if (!state.isPublic) throw new AppError(403, "LEADERBOARD_NOT_PUBLIC", "This leaderboard isn't public.");
      return { audience: LEADERBOARD_AUDIENCE.PUBLIC };
    },
    presentLeaderboard(board, access) {
      return { audience: access.audience, ...board };
    },
  };
  const live = createLeaderboardRealtime({ namespace, auth, service, delayMs: 5 });
  return { namespace, auth, state, live };
}

const opened = [];
afterEach(() => {
  for (const live of opened.splice(0)) live.close();
});
function setup() {
  const made = leaderboardSetup();
  opened.push(made.live);
  return made;
}

async function joined(namespace, token) {
  const socket = await namespace.connect(token);
  const ack = await socket.request(LEADERBOARD_EVENTS.JOIN, { competitionId: COMPETITION });
  assert.equal(ack.ok, true, JSON.stringify(ack));
  return socket;
}

describe("live leaderboard after the access token runs out (US-020 fix)", () => {
  it("keeps sending updates to logged-in viewers whose 15-minute token expired", async () => {
    const { namespace, auth, live } = setup();
    const sam = await joined(namespace, "sam-token");
    const admin = await joined(namespace, "admin-token");
    auth.expireToken("sam-token");
    auth.expireToken("admin-token");

    await live.sendUpdate(COMPETITION, "result");
    assert.equal(sam.eventsNamed(LEADERBOARD_EVENTS.UPDATE)[0].leaderboard.audience, "climber");
    assert.equal(admin.eventsNamed(LEADERBOARD_EVENTS.UPDATE)[0].leaderboard.audience, "manage");
    assert.deepEqual(sam.eventsNamed(LEADERBOARD_EVENTS.CLOSED), []);
  });

  it("still closes the leaderboard for a viewer whose login ended", async () => {
    const { namespace, auth, live } = setup();
    const sam = await joined(namespace, "sam-token");
    auth.endSession("6650000000000000000000b1");
    await live.sendUpdate(COMPETITION, "result");
    assert.equal(sam.eventsNamed(LEADERBOARD_EVENTS.CLOSED)[0].error, "SESSION_EXPIRED");
    assert.ok(!sam.rooms.has(roomFor(COMPETITION, LEADERBOARD_AUDIENCE.CLIMBER)));
  });

  it("refuses a new connection with an expired token, so the page refreshes it", async () => {
    const { namespace, auth } = setup();
    auth.expireToken("sam-token");
    await assert.rejects(namespace.connect("sam-token"), (error) => error.data.error === "TOKEN_EXPIRED");
  });

  it("checks the public room once for all Visitors", async () => {
    const { namespace, state, live } = setup();
    for (let visitor = 0; visitor < 4; visitor += 1) await joined(namespace, undefined);
    state.accessChecks = 0;
    await live.sendUpdate(COMPETITION, "result");
    assert.equal(state.accessChecks, 1);
  });

  it("moves a viewer whose access changed to their new view, with one update", async () => {
    const { namespace, state, live } = setup();
    state.registered.clear();
    const sam = await joined(namespace, "sam-token");
    assert.ok(sam.rooms.has(roomFor(COMPETITION, LEADERBOARD_AUDIENCE.PUBLIC)));

    state.registered.add(SAM);
    await live.sendUpdate(COMPETITION, "registration");
    const updates = sam.eventsNamed(LEADERBOARD_EVENTS.UPDATE);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].leaderboard.audience, "climber");
    assert.deepEqual([...sam.rooms], [roomFor(COMPETITION, LEADERBOARD_AUDIENCE.CLIMBER)]);
  });

  it("closes the public leaderboard for Visitors when public access is turned off", async () => {
    const { namespace, state, live } = setup();
    const visitor = await joined(namespace, undefined);
    state.isPublic = false;
    await live.sendUpdate(COMPETITION, "competition");
    assert.equal(visitor.eventsNamed(LEADERBOARD_EVENTS.CLOSED)[0].error, "LEADERBOARD_NOT_PUBLIC");
  });

  it("keeps viewers following through a database problem", async () => {
    const { namespace, state, live } = setup();
    const sam = await joined(namespace, "sam-token");
    state.failAccess = true;
    await live.sendUpdate(COMPETITION, "result");
    assert.deepEqual(sam.eventsNamed(LEADERBOARD_EVENTS.CLOSED), []);
    state.failAccess = false;
    await live.sendUpdate(COMPETITION, "result");
    assert.equal(sam.eventsNamed(LEADERBOARD_EVENTS.UPDATE).length, 1);
  });
});

// ---------- My Events ----------

const patched = [];
afterEach(() => {
  for (const [model, method, descriptor] of patched.splice(0)) {
    if (descriptor) Object.defineProperty(model, method, descriptor);
    else delete model[method];
  }
});
function stubRegistrations(rows, calls = []) {
  patched.push([Registration, "find", Object.getOwnPropertyDescriptor(Registration, "find")]);
  Registration.find = (filter) => {
    calls.push(filter);
    const chain = { populate: () => chain, lean: async () => rows };
    return chain;
  };
  return calls;
}

function daysFromToday(days) {
  const date = new Date(`${torontoToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}
const row = (id, days, overrides = {}) => ({
  _id: `66500000000000000000f00${id}`,
  status: "CONFIRMED",
  registeredAt: new Date("2026-10-01T12:00:00Z"),
  divisionId: { _id: "6650000000000000000000d1", name: "Open" },
  competitionId: {
    _id: `66500000000000000000c00${id}`,
    name: `Competition ${id}`,
    date: daysFromToday(days),
    location: "Toronto",
    status: "PUBLISHED",
    registrationStatus: "OPEN",
    gymId: { _id: "6650000000000000000000a1", name: "Hogtown Boulders", status: "ACTIVE" },
  },
  ...overrides,
});

describe("My Events (US-030 fix)", () => {
  it("reads only the logged-in Climber's registrations", async () => {
    const calls = stubRegistrations([]);
    await getMyEvents(SAM);
    assert.deepEqual(calls, [{ climberId: SAM }]);
  });

  it("lists upcoming events soonest first, then past events most recent first", async () => {
    stubRegistrations([row(1, -30), row(2, 20), row(3, -2), row(4, 0), row(5, 7)]);
    const { events } = await getMyEvents(SAM);
    assert.deepEqual(
      events.map((event) => [event.competition.name, event.competition.upcoming]),
      [
        ["Competition 4", true],
        ["Competition 5", true],
        ["Competition 2", true],
        ["Competition 3", false],
        ["Competition 1", false],
      ],
    );
  });

  it("skips a registration whose competition no longer exists instead of failing", async () => {
    stubRegistrations([row(1, 5), { ...row(2, 5), competitionId: null }]);
    const { events } = await getMyEvents(SAM);
    assert.deepEqual(events.map((event) => event.competition.name), ["Competition 1"]);
  });

  it("says when a gym is no longer active or a competition was cancelled, and labels the status", async () => {
    const cancelled = row(1, 5);
    cancelled.competitionId.status = "CANCELLED";
    cancelled.competitionId.gymId.status = "INACTIVE";
    stubRegistrations([cancelled, { ...row(2, 6), status: "WAITLIST", divisionId: null }]);
    const { events } = await getMyEvents(SAM);
    assert.equal(events[0].competition.status, "CANCELLED");
    assert.equal(events[0].competition.gym.active, false);
    assert.equal(events[1].registration.statusLabel, "On the waitlist");
    assert.equal(events[1].registration.division, null);
  });
});
