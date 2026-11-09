// Automated tests for US-031 My Scorecard: the scorecard API (what it returns, whose it is, routes
// without results, the errors) and the live scorecard updates over Socket.IO (who gets them, no
// duplicates, connection problems). They need no database or network: the models' queries and
// Socket.IO are replaced by fakes.
// Run from the server folder with:  npm test -- tests/scorecard.test.js

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "vitest";
import { ROLES } from "../src/constants/roles.js";
import { SCORECARD_EVENTS, SCORECARD_ROUTE_STATUS } from "../src/constants/scorecard.js";
import { getMyScorecard as scorecardHandler } from "../src/controllers/scorecardController.js";
import { requireRole } from "../src/middleware/requireRole.js";
import { Competition } from "../src/models/Competition.js";
import { Gym } from "../src/models/Gym.js";
import { OfficialResult } from "../src/models/OfficialResult.js";
import { Registration } from "../src/models/Registration.js";
import { Route } from "../src/models/Route.js";
import { createScorecardRealtime, scorecardRoom } from "../src/realtime/scorecardSocket.js";
import { LEADERBOARD_CHANGE, leaderboardChanged, onLeaderboardChanged } from "../src/services/leaderboardEvents.js";
import { getMyScorecard } from "../src/services/scorecardService.js";
import { AppError } from "../src/utils/AppError.js";
import { assertScorecardAccess, buildScorecard } from "../src/utils/scorecard.js";
import { fakeAuth, fakeNamespace, wait } from "./helpers/realtimeFakes.js";

const COMPETITION = "6650000000000000000000c1";
const OTHER_COMPETITION = "6650000000000000000000c2";
const GYM = "6650000000000000000000a1";
const SAM = "6650000000000000000000e1";
const ALEX = "6650000000000000000000e2";
const ROUTE = (n) => `66500000000000000000${String(n).padStart(4, "0")}`;
const TODAY = new Date("2026-11-14T00:00:00Z");

const competition = (overrides = {}) => ({
  _id: COMPETITION,
  gymId: GYM,
  name: "Fall Boulder Bash",
  date: TODAY,
  location: "1 Bathurst St, Toronto, ON",
  status: "PUBLISHED",
  scoring: { deductionPercent: 20, maxAttempts: 5 },
  ...overrides,
});
const gym = (status = "ACTIVE") => ({ _id: GYM, name: "Hogtown Boulders", status });
const registration = (overrides = {}) => ({
  _id: "6650000000000000000000f1",
  status: "CONFIRMED",
  divisionId: { _id: "6650000000000000000000d1", name: "Open" },
  ...overrides,
});
const route = (n, overrides = {}) => ({
  _id: ROUTE(n),
  routeNumber: String(n),
  grade: "V3",
  pointValue: 100,
  official: true,
  ...overrides,
});
const result = (n, overrides = {}) => ({
  routeId: ROUTE(n),
  attempts: 1,
  sends: 1,
  flash: true,
  officialScore: 100,
  updatedAt: new Date("2026-11-14T15:00:00Z"),
  ...overrides,
});

function build(overrides = {}) {
  return buildScorecard({
    competition: competition(),
    gym: gym(),
    registration: registration(),
    routes: [route(1), route(2), route(10), route(3)],
    results: [],
    today: TODAY,
    now: new Date("2026-11-14T16:00:00Z"),
    ...overrides,
  });
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => error instanceof AppError && error.code === code);
}

// ---------- replacing the models' queries ----------

const patched = [];
/** Replaces a model's static query method for one test, recording the filter it was called with. */
function stubQuery(model, method, answer, calls = []) {
  patched.push([model, method, Object.getOwnPropertyDescriptor(model, method)]);
  model[method] = (filter, fields) => {
    calls.push({ filter, fields });
    const value = typeof answer === "function" ? answer(filter) : answer;
    const chain = { populate: () => chain, lean: async () => structuredClone(value) };
    return chain;
  };
  return calls;
}
afterEach(() => {
  for (const [model, method, descriptor] of patched.splice(0).reverse()) {
    if (descriptor) Object.defineProperty(model, method, descriptor);
    else delete model[method];
  }
});

/** The database as scorecardService sees it: Sam and Alex are both registered and have results. */
function stubDatabase({ comp = competition(), gymStatus = "ACTIVE", registrations, results } = {}) {
  const registered = registrations ?? { [SAM]: registration(), [ALEX]: registration({ _id: "6650000000000000000000f2" }) };
  const everyResult = results ?? [
    { ...result(1), climberId: SAM },
    { ...result(2, { attempts: 3, sends: 0, flash: false, officialScore: 0 }), climberId: SAM },
    { ...result(1, { attempts: 4, flash: false, officialScore: 40 }), climberId: ALEX },
    { ...result(3), climberId: ALEX },
  ];
  const calls = {
    registration: stubQuery(Registration, "findOne", (filter) =>
      filter.competitionId === COMPETITION ? (registered[filter.climberId] ?? null) : null,
    ),
    results: stubQuery(OfficialResult, "find", (filter) =>
      everyResult
        .filter((entry) => entry.climberId === filter.climberId && filter.competitionId === COMPETITION)
        .map(({ climberId: _climberId, ...entry }) => entry),
    ),
  };
  stubQuery(Competition, "findById", (id) => (id === COMPETITION ? comp : null));
  stubQuery(Gym, "findById", () => gym(gymStatus));
  stubQuery(Route, "find", () => [route(1), route(2), route(3)]);
  return calls;
}

// ---------- the scorecard (backend API task) ----------

describe("building the scorecard", () => {
  it("lists every official problem of the competition, by route number as on the wall", () => {
    const scorecard = build({
      routes: [route(10), route(2), route(1, { official: false }), route(3), { ...route(4), routeNumber: "A2" }],
    });
    assert.deepEqual(
      scorecard.routes.map((entry) => entry.routeNumber),
      ["2", "3", "10", "A2"],
    );
    assert.equal(scorecard.summary.routeCount, 4);
  });

  it("includes the Climber's official result on each problem, and null on a problem without one", () => {
    const scorecard = build({
      results: [result(1), result(2, { attempts: 3, sends: 0, flash: false, officialScore: 0 })],
    });
    const [one, two, three, ten] = scorecard.routes;
    assert.deepEqual(one.result, {
      attempts: 1,
      sends: 1,
      sent: true,
      flash: true,
      officialScore: 100,
      attemptsLeft: 0,
      updatedAt: "2026-11-14T15:00:00.000Z",
    });
    assert.equal(two.result.attempts, 3);
    assert.equal(two.result.attemptsLeft, 2);
    assert.equal(three.result, null);
    assert.equal(ten.result, null);
  });

  it("marks completed and unfinished problems (flashed, sent, attempted, not attempted)", () => {
    const scorecard = build({
      results: [
        result(1),
        result(2, { attempts: 3, flash: false, officialScore: 60 }),
        result(3, { attempts: 2, sends: 0, flash: false, officialScore: 0 }),
      ],
    });
    assert.deepEqual(
      scorecard.routes.map((entry) => [entry.routeNumber, entry.status, entry.completed]),
      [
        ["1", SCORECARD_ROUTE_STATUS.FLASHED, true],
        ["2", SCORECARD_ROUTE_STATUS.SENT, true],
        ["3", SCORECARD_ROUTE_STATUS.ATTEMPTED, false],
        ["10", SCORECARD_ROUTE_STATUS.NOT_ATTEMPTED, false],
      ],
    );
    assert.deepEqual(scorecard.summary, {
      routeCount: 4,
      completed: 2,
      unfinished: 2,
      flashes: 1,
      attempted: 1,
      notAttempted: 1,
      totalAttempts: 6,
      totalScore: 160,
    });
  });

  it("shows the official scores as saved, and leaves out results on problems that aren't official", () => {
    const scorecard = build({
      routes: [route(1), route(2, { official: false })],
      results: [result(1, { officialScore: 87 }), result(2, { officialScore: 50 })],
    });
    assert.equal(scorecard.routes.length, 1);
    assert.equal(scorecard.summary.totalScore, 87);
  });

  it("works for a competition with no problems or no results yet", () => {
    const empty = build({ routes: [] });
    assert.deepEqual(empty.routes, []);
    assert.equal(empty.summary.totalScore, 0);
    assert.equal(empty.lastResultAt, null);
    const noResults = build();
    assert.equal(noResults.summary.notAttempted, 4);
    assert.ok(noResults.routes.every((entry) => entry.result === null && !entry.completed));
  });

  it("describes the competition, the Climber's registration and the scoring, with no private details", () => {
    const scorecard = build({ routes: [route(1, { notes: "Setter notes" })], results: [result(1)] });
    assert.deepEqual(scorecard.competition, {
      _id: COMPETITION,
      name: "Fall Boulder Bash",
      date: "2026-11-14",
      location: "1 Bathurst St, Toronto, ON",
      status: "PUBLISHED",
      upcoming: true,
      gym: { _id: GYM, name: "Hogtown Boulders", active: true },
    });
    assert.equal(scorecard.registration.statusLabel, "Confirmed");
    assert.deepEqual(scorecard.registration.division, { _id: "6650000000000000000000d1", name: "Open" });
    assert.equal(scorecard.scoring.label, "20% off for each failed attempt, up to 5 attempts");
    const text = JSON.stringify(scorecard);
    for (const secret of ["Setter notes", "climberId", "updatedBy", "createdBy", "email"]) {
      assert.ok(!text.includes(secret), `the scorecard mustn't include ${secret}`);
    }
  });
});

describe("who can see a scorecard", () => {
  it("lets a registered Climber see it, even after the competition is cancelled or the gym deactivated", () => {
    assert.doesNotThrow(() =>
      assertScorecardAccess({ competition: competition(), gym: gym(), registration: registration() }),
    );
    assert.doesNotThrow(() =>
      assertScorecardAccess({
        competition: competition({ status: "CANCELLED" }),
        gym: gym("INACTIVE"),
        registration: registration(),
      }),
    );
  });

  it("answers 404 COMPETITION_NOT_FOUND for a missing competition or a draft", () => {
    for (const found of [
      { competition: null, gym: null, registration: null },
      { competition: competition({ status: "DRAFT" }), gym: gym(), registration: registration() },
    ]) {
      assert.throws(() => assertScorecardAccess(found), (error) => error.status === 404 && error.code === "COMPETITION_NOT_FOUND");
    }
  });

  it("answers 404 REGISTRATION_NOT_FOUND to a Climber who isn't registered, without revealing hidden competitions", () => {
    assert.throws(
      () => assertScorecardAccess({ competition: competition(), gym: gym(), registration: null }),
      (error) => error.status === 404 && error.code === "REGISTRATION_NOT_FOUND",
    );
    assert.throws(
      () => assertScorecardAccess({ competition: competition({ status: "CANCELLED" }), gym: gym(), registration: null }),
      (error) => error.code === "COMPETITION_NOT_FOUND",
    );
    assert.throws(
      () => assertScorecardAccess({ competition: competition(), gym: gym("INACTIVE"), registration: null }),
      (error) => error.code === "COMPETITION_NOT_FOUND",
    );
  });
});

describe("GET /api/competitions/:competitionId/scorecard", () => {
  it("returns the logged-in Climber's own results, read with their ID from the access token", async () => {
    const calls = stubDatabase();
    const res = { locals: { params: { competitionId: COMPETITION } }, json(body) { this.body = body; } };
    await scorecardHandler({ auth: { userId: SAM, role: ROLES.CLIMBER } }, res);

    assert.deepEqual(calls.registration[0].filter, { competitionId: COMPETITION, climberId: SAM });
    assert.deepEqual(calls.results[0].filter, { competitionId: COMPETITION, climberId: SAM });
    assert.deepEqual(
      res.body.routes.map((entry) => [entry.routeNumber, entry.status, entry.result?.officialScore ?? null]),
      [["1", "FLASHED", 100], ["2", "ATTEMPTED", 0], ["3", "NOT_ATTEMPTED", null]],
    );
    assert.equal(res.body.summary.totalScore, 100);
  });

  it("never returns another Climber's results: Alex's scorecard has only Alex's", async () => {
    stubDatabase();
    const [sam, alex] = await Promise.all([getMyScorecard(SAM, COMPETITION), getMyScorecard(ALEX, COMPETITION)]);
    assert.equal(sam.routes[0].result.officialScore, 100);
    assert.equal(alex.routes[0].result.officialScore, 40);
    assert.equal(alex.routes[1].result, null, "Sam's attempt on route 2 isn't on Alex's scorecard");
    assert.equal(alex.routes[2].result.officialScore, 100);
    assert.notEqual(sam.registration.registrationId, alex.registration.registrationId);
  });

  it("reads results of the selected competition only", async () => {
    const calls = stubDatabase();
    await getMyScorecard(SAM, COMPETITION);
    assert.equal(calls.results[0].filter.competitionId, COMPETITION);
    await rejectsWith(getMyScorecard(SAM, OTHER_COMPETITION), "COMPETITION_NOT_FOUND");
  });

  it("answers 404 REGISTRATION_NOT_FOUND for a Climber who isn't registered", async () => {
    stubDatabase({ registrations: {} });
    await rejectsWith(getMyScorecard(SAM, COMPETITION), "REGISTRATION_NOT_FOUND");
  });

  it("is only for Climbers: the route sits behind the CLIMBER role check, with no climberId to choose", () => {
    const source = readFileSync(new URL("../src/routes/competitionRoutes.js", import.meta.url), "utf8");
    const roleCheck = source.indexOf("router.use(noStore, requireAuth(auth), requireRole(ROLES.CLIMBER))");
    const scorecard = source.indexOf('"/:competitionId/scorecard"');
    const details = source.indexOf('"/:competitionId",');
    assert.ok(roleCheck > 0 && scorecard > roleCheck, "the scorecard route needs a Climber's login");
    assert.ok(scorecard < details, "it's registered before /:competitionId");
    assert.ok(!source.slice(scorecard, scorecard + 200).includes("climberId"));

    assert.throws(
      () => requireRole(ROLES.CLIMBER)({ auth: { role: ROLES.GYM_ADMIN } }, {}, () => {}),
      (error) => error.status === 403 && error.code === "ROLE_FORBIDDEN",
    );
  });
});

// ---------- live scorecard updates ----------

/** A live scorecard with Sam and Alex logged in, reading scorecards from a changeable store. */
function liveSetup({ delayMs = 5 } = {}) {
  const namespace = fakeNamespace();
  const auth = fakeAuth();
  auth.login("sam-token", { userId: SAM, role: ROLES.CLIMBER, sessionId: "6650000000000000000000b1" });
  auth.login("sam-phone", { userId: SAM, role: ROLES.CLIMBER, sessionId: "6650000000000000000000b2" });
  auth.login("alex-token", { userId: ALEX, role: ROLES.CLIMBER, sessionId: "6650000000000000000000b3" });
  auth.login("admin-token", { userId: "6650000000000000000000e9", role: ROLES.GYM_ADMIN, sessionId: "6650000000000000000000b9" });

  const store = {
    [SAM]: { [COMPETITION]: [result(1, { attempts: 2, flash: false, officialScore: 80 })] },
    [ALEX]: { [COMPETITION]: [] },
  };
  const reads = [];
  let failNextRead = false;
  const loadScorecard = async (climberId, competitionId) => {
    reads.push({ climberId, competitionId });
    if (failNextRead) {
      failNextRead = false;
      throw new Error("connection to the database was lost");
    }
    const results = store[climberId]?.[competitionId];
    if (!results) throw new AppError(404, "REGISTRATION_NOT_FOUND", "You're not registered for this competition.");
    return build({ routes: [route(1), route(2)], results, now: new Date() });
  };
  const live = createScorecardRealtime({ namespace, auth, delayMs, loadScorecard });
  return {
    namespace,
    auth,
    store,
    reads,
    live,
    failNextRead: () => {
      failNextRead = true;
    },
  };
}

let openLive = [];
afterEach(() => {
  for (const live of openLive.splice(0)) live.close();
});
function track(setup) {
  openLive.push(setup.live);
  return setup;
}

describe("live scorecard: connecting and joining", () => {
  it("lets only a logged-in Climber connect", async () => {
    const { namespace } = track(liveSetup());
    await assert.rejects(namespace.connect(undefined), (error) => error.data.error === "NOT_AUTHENTICATED");
    await assert.rejects(namespace.connect("made-up"), (error) => error.data.error === "NOT_AUTHENTICATED");
    await assert.rejects(namespace.connect("admin-token"), (error) => error.data.error === "ROLE_FORBIDDEN");
    const sam = await namespace.connect("sam-token");
    assert.equal(sam.data.viewer.userId, SAM);
  });

  it("answers the current scorecard when joining, the same shape as the API", async () => {
    const { namespace } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    const ack = await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    assert.equal(ack.ok, true);
    assert.equal(ack.scorecard.routes[0].result.officialScore, 80);
    assert.ok(sam.rooms.has(scorecardRoom(COMPETITION, SAM)));
  });

  it("refuses another Climber's scorecard, a competition the Climber isn't registered for, and a bad ID", async () => {
    const { namespace } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    const asAlex = await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION, climberId: ALEX });
    assert.equal(asAlex.error.error, "SCORECARD_FORBIDDEN");
    const notRegistered = await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: OTHER_COMPETITION });
    assert.equal(notRegistered.error.error, "REGISTRATION_NOT_FOUND");
    const badId = await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: "not-an-id" });
    assert.equal(badId.error.error, "VALIDATION_ERROR");
    assert.deepEqual([...sam.rooms], []);
  });
});

describe("live scorecard: joining while results change", () => {
  it("joins the room before reading the scorecard, so an update sent meanwhile isn't missed", async () => {
    const namespace = fakeNamespace();
    const auth = fakeAuth();
    auth.login("sam-token", { userId: SAM, role: ROLES.CLIMBER, sessionId: "6650000000000000000000b1" });
    const membersWhenRead = [];
    const live = createScorecardRealtime({
      namespace,
      auth,
      loadScorecard: async () => {
        membersWhenRead.push(namespace.adapter.rooms.get(scorecardRoom(COMPETITION, SAM))?.size ?? 0);
        return build();
      },
    });
    openLive.push(live);
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    assert.deepEqual(membersWhenRead, [1]);
  });

  it("leaves no room behind when joining fails", async () => {
    const { namespace } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: OTHER_COMPETITION });
    assert.equal(namespace.adapter.rooms.size, 0);
  });

  it("still updates the first device when a second one joins while an update is on its way", async () => {
    const { namespace, store, live } = track(liveSetup());
    const laptop = await namespace.connect("sam-token");
    await laptop.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });

    // A result is saved; its update is still waiting when Sam's phone joins and reads it.
    store[SAM][COMPETITION] = [result(1)];
    const phone = await namespace.connect("sam-phone");
    const ack = await phone.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    assert.equal(ack.scorecard.routes[0].status, "FLASHED");

    await live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    const [update] = laptop.eventsNamed(SCORECARD_EVENTS.UPDATE);
    assert.equal(update?.scorecard.routes[0].status, "FLASHED", "the laptop gets the new result too");
  });
});

describe("live scorecard: updates", () => {
  it("sends the changed scorecard to that Climber only, and nothing to other Climbers", async () => {
    const { namespace, store, live, reads } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    const alex = await namespace.connect("alex-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    await alex.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    reads.length = 0;

    store[SAM][COMPETITION] = [result(1, { attempts: 2, flash: false, officialScore: 80 }), result(2)];
    await live.sendUpdate(COMPETITION, { climberIds: [SAM], reasons: [LEADERBOARD_CHANGE.RESULT] });

    const [update] = sam.eventsNamed(SCORECARD_EVENTS.UPDATE);
    assert.equal(update.competitionId, COMPETITION);
    assert.equal(update.reason, "result");
    assert.equal(update.scorecard.routes[1].status, "FLASHED");
    assert.equal(update.scorecard.summary.completed, 2);
    assert.deepEqual(alex.eventsNamed(SCORECARD_EVENTS.UPDATE), [], "Alex gets none of Sam's updates");
    assert.deepEqual(reads, [{ climberId: SAM, competitionId: COMPETITION }], "only Sam's scorecard is read");
  });

  it("reaches every one of the Climber's own connections, such as a phone and a laptop", async () => {
    const { namespace, store, live } = track(liveSetup());
    const laptop = await namespace.connect("sam-token");
    const phone = await namespace.connect("sam-phone");
    await laptop.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    await phone.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    store[SAM][COMPETITION] = [result(1)];
    await live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.equal(laptop.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1);
    assert.equal(phone.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1);
  });

  it("updates when an official result is saved, through the same change event result entry sends", async () => {
    const { namespace, store } = track(liveSetup({ delayMs: 5 }));
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });

    store[SAM][COMPETITION] = [result(1)];
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: SAM });
    await wait(40);
    const updates = sam.eventsNamed(SCORECARD_EVENTS.UPDATE);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].scorecard.routes[0].status, "FLASHED");
  });

  it("sends one update for a burst of changes, and none when the scorecard didn't change", async () => {
    const { namespace, store, reads } = track(liveSetup({ delayMs: 10 }));
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    reads.length = 0;

    store[SAM][COMPETITION] = [result(1, { attempts: 3, sends: 0, flash: false, officialScore: 0 })];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: SAM });
    }
    await wait(50);
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1, "five quick saves, one update");
    assert.equal(reads.length, 1);

    // A scoring change that leaves Sam's scorecard as it was sends nothing more.
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.SCORING);
    await wait(50);
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1);
  });

  it("never sends the same update twice to a connection that joined twice", async () => {
    const { namespace, store, live } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    store[SAM][COMPETITION] = [result(1)];
    await live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1);
    assert.equal(namespace.adapter.rooms.get(scorecardRoom(COMPETITION, SAM)).size, 1);
  });

  it("checks every follower's scorecard when a change isn't about one Climber, such as the scoring", async () => {
    const { namespace, store, live } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    const alex = await namespace.connect("alex-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    await alex.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    store[SAM][COMPETITION] = [result(1, { attempts: 2, flash: false, officialScore: 70 })];
    store[ALEX][COMPETITION] = [result(2, { attempts: 2, flash: false, officialScore: 70 })];
    await live.sendUpdate(COMPETITION, { climberIds: null, reasons: [LEADERBOARD_CHANGE.SCORING] });
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.UPDATE)[0].scorecard.summary.totalScore, 70);
    assert.equal(alex.eventsNamed(SCORECARD_EVENTS.UPDATE)[0].scorecard.routes[1].result.officialScore, 70);
  });

  it("stops sending after the Climber leaves", async () => {
    const { namespace, store, live } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    assert.deepEqual(await sam.request(SCORECARD_EVENTS.LEAVE, { competitionId: COMPETITION }), { ok: true });
    store[SAM][COMPETITION] = [result(1)];
    await live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.deepEqual(sam.eventsNamed(SCORECARD_EVENTS.UPDATE), []);
  });
});

describe("live scorecard: connection problems", () => {
  it("keeps updating after the 15-minute access token runs out, while the login is still going", async () => {
    const { namespace, auth, store, live } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    auth.expireToken("sam-token");
    store[SAM][COMPETITION] = [result(1)];
    await live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1);
    assert.deepEqual(sam.eventsNamed(SCORECARD_EVENTS.CLOSED), []);
  });

  it("closes the scorecard when the login ends, such as logging out or a deactivated account", async () => {
    const { namespace, auth, store, live } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    auth.endSession("6650000000000000000000b1");
    store[SAM][COMPETITION] = [result(1)];
    await live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.deepEqual(sam.eventsNamed(SCORECARD_EVENTS.UPDATE), []);
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.CLOSED)[0].error, "SESSION_EXPIRED");
    assert.ok(!sam.rooms.has(scorecardRoom(COMPETITION, SAM)));
  });

  it("closes the scorecard when the Climber's registration is removed", async () => {
    const { namespace, store, live } = track(liveSetup());
    const sam = await namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    delete store[SAM][COMPETITION];
    await live.sendUpdate(COMPETITION, { climberIds: null, reasons: [LEADERBOARD_CHANGE.REGISTRATION] });
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.CLOSED)[0].error, "REGISTRATION_NOT_FOUND");
  });

  it("keeps the Climber following through a database problem, and sends the next update", async () => {
    const setup = track(liveSetup());
    const sam = await setup.namespace.connect("sam-token");
    await sam.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    setup.failNextRead();
    setup.store[SAM][COMPETITION] = [result(1)];
    await setup.live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.deepEqual(sam.eventsNamed(SCORECARD_EVENTS.CLOSED), [], "a database blip doesn't close it");
    await setup.live.sendUpdate(COMPETITION, { climberIds: [SAM] });
    assert.equal(sam.eventsNamed(SCORECARD_EVENTS.UPDATE).length, 1);
  });

  it("answers the current scorecard again after a reconnect, so a missed update isn't lost", async () => {
    const { namespace, store } = track(liveSetup());
    const first = await namespace.connect("sam-token");
    await first.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    first.disconnect();
    store[SAM][COMPETITION] = [result(1)];
    const again = await namespace.connect("sam-token");
    const ack = await again.request(SCORECARD_EVENTS.JOIN, { competitionId: COMPETITION });
    assert.equal(ack.scorecard.routes[0].status, "FLASHED");
  });
});

describe("result change events", () => {
  it("carry the Climber a result belongs to", () => {
    const seen = [];
    const stop = onLeaderboardChanged((change) => seen.push(change));
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.RESULT, { climberId: SAM });
    leaderboardChanged(COMPETITION, LEADERBOARD_CHANGE.SCORING);
    stop();
    assert.deepEqual(seen, [
      { competitionId: COMPETITION, reason: "result", climberId: SAM },
      { competitionId: COMPETITION, reason: "scoring" },
    ]);
  });

  it("are sent by result entry with the Climber, when a result is saved and when it's deleted", () => {
    const source = readFileSync(new URL("../src/services/officialResultService.js", import.meta.url), "utf8");
    const calls = source.match(/leaderboardChanged\(entry\.competition\._id, LEADERBOARD_CHANGE\.RESULT, \{\s*climberId: entry\.climberId,\s*\}\)/g);
    assert.equal(calls?.length, 2);
  });
});
