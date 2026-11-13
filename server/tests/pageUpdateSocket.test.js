// Automated tests for the live page updates over Socket.IO: who is told about which change, and
// what happens to a connection whose login ended.
// They need no database or network.
// Run from the server folder with:  npm test -- tests/pageUpdateSocket.test.js

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_TOPIC,
  PAGE_TOPIC_ROLES,
  PAGE_UPDATE_EVENTS,
  PAGE_UPDATES_NAMESPACE,
} from "../src/constants/pageUpdates.js";
import { ROLES } from "../src/constants/roles.js";
import { createPageUpdateRealtime, roleRoom } from "../src/realtime/pageUpdateSocket.js";
import { pageChanged } from "../src/services/pageUpdateEvents.js";
import { logger } from "../src/utils/logger.js";
import { fakeAuth, fakeNamespace, wait } from "./helpers/realtimeFakes.js";

const COMPETITION = "6650000000000000000000c1";
const OTHER_COMPETITION = "6650000000000000000000c2";
const { COMPETITIONS, RESULTS, GYMS, USERS, GYM_REQUESTS, SETTINGS } = PAGE_TOPIC;

const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
});

const about = (competitionId, ...topics) => topics.map((topic) => ({ topic, competitionId }));
const topics = (...names) => names.map((topic) => ({ topic }));

describe("live page updates over Socket.IO", () => {
  const SESSIONS = { admin: "6650000000000000000000b1", gymAdmin: "6650000000000000000000b2", climber: "6650000000000000000000b3" };

  function setup(options = {}) {
    const namespace = fakeNamespace();
    const auth = fakeAuth();
    auth.login("admin-token", { userId: "6650000000000000000000e1", role: ROLES.ADMIN, sessionId: SESSIONS.admin });
    auth.login("gym-admin-token", { userId: "6650000000000000000000e2", role: ROLES.GYM_ADMIN, sessionId: SESSIONS.gymAdmin });
    auth.login("climber-token", { userId: "6650000000000000000000e3", role: ROLES.CLIMBER, sessionId: SESSIONS.climber });
    const clock = { now: 1_000_000 };
    const live = createPageUpdateRealtime({ namespace, auth, delayMs: 5, now: () => clock.now, ...options });
    stops.push(() => live.close());
    return { namespace, auth, live, clock };
  }

  const changed = (socket) => socket.eventsNamed(PAGE_UPDATE_EVENTS.CHANGED);

  it("uses its own namespace", () => {
    expect(PAGE_UPDATES_NAMESPACE).toBe("/updates");
  });

  it("refuses a connection without a login, with an unknown token, or with an expired one", async () => {
    const { namespace, auth } = setup();
    auth.expireToken("climber-token");

    await expect(namespace.connect(undefined)).rejects.toMatchObject({ data: { error: "NOT_AUTHENTICATED" } });
    await expect(namespace.connect("made-up")).rejects.toMatchObject({ data: { error: "NOT_AUTHENTICATED" } });
    await expect(namespace.connect("climber-token")).rejects.toMatchObject({ data: { error: "TOKEN_EXPIRED" } });
  });

  it("refuses a connection whose login session already ended", async () => {
    const { namespace, auth } = setup();
    auth.endSession(SESSIONS.climber);

    await expect(namespace.connect("climber-token")).rejects.toMatchObject({ data: { error: "SESSION_EXPIRED" } });
  });

  it("puts each connection in the room of the role in its token", async () => {
    const { namespace } = setup();

    const admin = await namespace.connect("admin-token");
    const climber = await namespace.connect("climber-token");

    expect([...admin.rooms]).toEqual([roleRoom(ROLES.ADMIN)]);
    expect([...climber.rooms]).toEqual([roleRoom(ROLES.CLIMBER)]);
  });

  it("tells every role about a competition, but only staff which one", async () => {
    const { namespace, live } = setup();
    const admin = await namespace.connect("admin-token");
    const gymAdmin = await namespace.connect("gym-admin-token");
    const climber = await namespace.connect("climber-token");

    await live.send(about(COMPETITION, COMPETITIONS));

    expect(changed(admin)).toEqual([{ changes: about(COMPETITION, COMPETITIONS) }]);
    expect(changed(gymAdmin)).toEqual([{ changes: about(COMPETITION, COMPETITIONS) }]);
    expect(changed(climber)).toEqual([{ changes: topics(COMPETITIONS) }]);
  });

  it("tells only Gym Administrators about results", async () => {
    const { namespace, live } = setup();
    const admin = await namespace.connect("admin-token");
    const gymAdmin = await namespace.connect("gym-admin-token");
    const climber = await namespace.connect("climber-token");

    await live.send(about(COMPETITION, RESULTS));

    expect(changed(gymAdmin)).toEqual([{ changes: about(COMPETITION, RESULTS) }]);
    expect(changed(admin)).toEqual([]);
    expect(changed(climber)).toEqual([]);
  });

  it("keeps accounts, gym requests and settings to System Administrators", async () => {
    const { namespace, live } = setup();
    const admin = await namespace.connect("admin-token");
    const gymAdmin = await namespace.connect("gym-admin-token");
    const climber = await namespace.connect("climber-token");

    await live.send(topics(USERS, GYM_REQUESTS, SETTINGS));

    expect(changed(admin)).toEqual([{ changes: topics(USERS, GYM_REQUESTS, SETTINGS) }]);
    expect(changed(gymAdmin)).toEqual([]);
    expect(changed(climber)).toEqual([]);
  });

  it("tells every role about gyms", async () => {
    const { namespace, live } = setup();
    const sockets = await Promise.all(["admin-token", "gym-admin-token", "climber-token"].map((token) => namespace.connect(token)));

    await live.send(topics(GYMS));

    for (const socket of sockets) expect(changed(socket)).toEqual([{ changes: topics(GYMS) }]);
  });

  it("lists every topic for at least one role, and only known roles", () => {
    for (const topic of Object.values(PAGE_TOPIC)) {
      expect(PAGE_TOPIC_ROLES[topic].length).toBeGreaterThan(0);
      expect(PAGE_TOPIC_ROLES[topic].every((role) => Object.values(ROLES).includes(role))).toBe(true);
    }
  });

  it("sends a change once, even when it was announced several times", async () => {
    const { namespace, live } = setup();
    const gymAdmin = await namespace.connect("gym-admin-token");
    const climber = await namespace.connect("climber-token");

    await live.send([
      ...about(COMPETITION, RESULTS),
      ...about(COMPETITION, RESULTS),
      ...about(COMPETITION, COMPETITIONS),
      ...about(OTHER_COMPETITION, COMPETITIONS),
    ]);

    expect(changed(gymAdmin)).toEqual([
      { changes: [...about(COMPETITION, RESULTS), ...about(COMPETITION, COMPETITIONS), ...about(OTHER_COMPETITION, COMPETITIONS)] },
    ]);
    expect(changed(climber)).toEqual([{ changes: topics(COMPETITIONS) }]);
  });

  it("ignores a topic it doesn't know", async () => {
    const { namespace, live } = setup();
    const admin = await namespace.connect("admin-token");

    await live.send(topics("made-up"));

    expect(changed(admin)).toEqual([]);
  });

  it("gathers a burst of saves into one message", async () => {
    const { namespace } = setup();
    const gymAdmin = await namespace.connect("gym-admin-token");

    pageChanged(RESULTS, { competitionId: COMPETITION });
    pageChanged(RESULTS, { competitionId: COMPETITION });
    pageChanged(COMPETITIONS, { competitionId: COMPETITION });
    expect(changed(gymAdmin)).toEqual([]);
    await wait(30);

    expect(changed(gymAdmin)).toEqual([{ changes: [...about(COMPETITION, RESULTS), ...about(COMPETITION, COMPETITIONS)] }]);
  });

  it("sends later changes in a new message", async () => {
    const { namespace } = setup();
    const admin = await namespace.connect("admin-token");

    pageChanged(USERS);
    await wait(30);
    pageChanged(GYMS);
    await wait(30);

    expect(changed(admin)).toEqual([{ changes: topics(USERS) }, { changes: topics(GYMS) }]);
  });

  it("stops announcing once it's closed", async () => {
    const { namespace, live } = setup();
    const admin = await namespace.connect("admin-token");

    pageChanged(USERS);
    live.close();
    pageChanged(GYMS);
    await wait(30);

    expect(changed(admin)).toEqual([]);
  });

  it("trusts a login check for a while, then checks the session again before sending", async () => {
    const { namespace, auth, live, clock } = setup({ sessionCheckMs: 60_000 });
    await namespace.connect("admin-token");
    const checksAfterConnecting = auth.sessionChecks.length;

    await live.send(topics(USERS));
    clock.now += 59_000;
    await live.send(topics(USERS));
    expect(auth.sessionChecks.length).toBe(checksAfterConnecting);

    clock.now += 2_000;
    await live.send(topics(USERS));
    await live.send(topics(USERS));

    expect(auth.sessionChecks.length).toBe(checksAfterConnecting + 1);
  });

  it("closes a connection whose login ended instead of sending it the change", async () => {
    const { namespace, auth, live, clock } = setup({ sessionCheckMs: 60_000 });
    const loggedOut = await namespace.connect("admin-token");
    const stillIn = await namespace.connect("gym-admin-token");
    auth.endSession(SESSIONS.admin);
    clock.now += 61_000;

    await live.send(topics(GYMS));

    expect(changed(loggedOut)).toEqual([]);
    expect(loggedOut.eventsNamed(PAGE_UPDATE_EVENTS.CLOSED)).toEqual([
      { error: "SESSION_EXPIRED", message: "Your session expired. Log in again to continue." },
    ]);
    expect(loggedOut.rooms.size).toBe(0);
    expect(changed(stillIn)).toEqual([{ changes: topics(GYMS) }]);
  });

  it("keeps a connection, without the change, when the login check itself fails", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const { namespace, auth, live, clock } = setup({ sessionCheckMs: 60_000 });
    const admin = await namespace.connect("admin-token");
    clock.now += 61_000;
    vi.spyOn(auth.sessions, "findActive").mockRejectedValueOnce(new Error("connection to the database was lost"));

    await live.send(topics(GYMS));
    expect(changed(admin)).toEqual([]);
    expect(admin.rooms.size).toBe(1);

    await live.send(topics(GYMS));
    expect(changed(admin)).toEqual([{ changes: topics(GYMS) }]);
  });

  it("carries no data, only what kind of data changed", async () => {
    const { namespace, live } = setup();
    const gymAdmin = await namespace.connect("gym-admin-token");

    await live.send([{ topic: RESULTS, competitionId: COMPETITION, climberId: "u1", score: 500 }]);

    expect(changed(gymAdmin)).toEqual([{ changes: about(COMPETITION, RESULTS) }]);
  });
});
