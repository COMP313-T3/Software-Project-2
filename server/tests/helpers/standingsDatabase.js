// An in-memory stand-in for the models the leaderboard standings, the scorecard and the Climber
// Route Assistant read, so they can be tested without a database.

import { vi } from "vitest";
import { Competition } from "../../src/models/Competition.js";
import { Division } from "../../src/models/Division.js";
import { Gym } from "../../src/models/Gym.js";
import { OfficialResult } from "../../src/models/OfficialResult.js";
import { Registration } from "../../src/models/Registration.js";
import { Route } from "../../src/models/Route.js";
import { User } from "../../src/models/User.js";

export const COMPETITION = "6650000000000000000000c1";
export const OTHER_COMPETITION = "6650000000000000000000c2";
export const GYM = "6650000000000000000000a1";
export const OPEN = "6650000000000000000000d1";
export const YOUTH = "6650000000000000000000d2";
export const OTHER_DIVISION = "6650000000000000000000d3";
export const ROUTE_100 = "6650000000000000000000b1";
export const ROUTE_200 = "6650000000000000000000b2";
export const ROUTE_300 = "6650000000000000000000b3";
export const OTHER_ROUTE = "6650000000000000000000b4";

/**
 * A moment during both competitions, after their starts. Tests set the clock to it, since a
 * Climber's leaderboard, scorecard and Route Assistant open when the competition starts.
 */
export const DURING_COMPETITION = new Date("2026-11-14T16:00:00Z");

export const CLIMBERS = Object.freeze({
  alex: { _id: "6650000000000000000000e1", firstName: "Alex", lastName: "Moreau" },
  kim: { _id: "6650000000000000000000e2", firstName: "Kim", lastName: "Chen" },
  sam: { _id: "6650000000000000000000e3", firstName: "Sam", lastName: "Rivera" },
  lee: { _id: "6650000000000000000000e4", firstName: "Lee", lastName: "Park" },
  max: { _id: "6650000000000000000000e5", firstName: "Max", lastName: "Young" },
  pat: { _id: "6650000000000000000000e6", firstName: "Pat", lastName: "Doyle" },
  una: { _id: "6650000000000000000000e7", firstName: "Una", lastName: "Ward" },
  ola: { _id: "6650000000000000000000e8", firstName: "Ola", lastName: "Berg" },
});

const same = (a, b) => String(a) === String(b);
const matches = (row, filter) =>
  Object.entries(filter).every(([field, value]) => same(row[field], value));

function query(rows, { single = false, linked = {} } = {}) {
  let list = [...rows];
  const chain = {
    populate(field) {
      list = list.map((row) => ({
        ...row,
        [field]: (linked[field] ?? []).find((linkedRow) => same(linkedRow._id, row[field])) ?? null,
      }));
      return chain;
    },
    sort(order) {
      const [[field, direction]] = Object.entries(order);
      list = [...list].sort((a, b) => (a[field] - b[field]) * direction);
      return chain;
    },
    collation: () => chain,
    lean: async () => structuredClone(single ? (list[0] ?? null) : list),
  };
  return chain;
}

let nextResult = 0;

/**
 * One result, as saved: attempts up to and including the top, and sends 1 when it was topped.
 *
 * @param {{ _id: string }} climber The Climber.
 * @param {string} routeId The problem.
 * @param {number} attempts Attempts on it.
 * @param {boolean} sent Whether the last attempt topped it.
 * @param {string} [competitionId] The competition.
 * @returns {object} The result.
 */
export function result(climber, routeId, attempts, sent, competitionId = COMPETITION) {
  nextResult += 1;
  return {
    _id: `66500000000000000000${String(nextResult).padStart(4, "0")}`,
    competitionId,
    climberId: climber._id,
    routeId,
    attempts,
    sends: sent ? 1 : 0,
    flash: sent && attempts === 1,
    updatedAt: new Date(Date.UTC(2026, 10, 14, 17, 0, nextResult)),
  };
}

/**
 * A competition with two divisions and Climbers in every state the standings care about:
 *
 * Open: Alex 460 (a 300 flash and a 200 in two attempts), Kim 260 (300 in two attempts and 100 in
 * five, no flash), Sam 260 (a 200 flash and 100 in three), Lee with no results, Pat on the
 * waitlist and Ola pending. Youth: Max 100 (a flash). Una isn't registered.
 *
 * @returns {object} The data, which tests can change before each request.
 */
export function standingsData() {
  const { alex, kim, sam, lee, max, pat, una, ola } = CLIMBERS;
  const registration = (id, climber, divisionId, status = "CONFIRMED") => ({
    _id: `6650000000000000000000f${id}`,
    competitionId: COMPETITION,
    climberId: climber._id,
    divisionId,
    status,
  });
  return {
    competitions: [
      {
        _id: COMPETITION,
        gymId: GYM,
        name: "Fall Boulder Bash",
        date: new Date("2026-11-14T00:00:00Z"),
        status: "PUBLISHED",
        publicLeaderboard: false,
        scoring: { deductionPercent: 20, maxAttempts: 5 },
      },
      {
        _id: OTHER_COMPETITION,
        gymId: GYM,
        name: "Winter Send Fest",
        date: new Date("2026-11-07T00:00:00Z"),
        status: "PUBLISHED",
        publicLeaderboard: false,
        scoring: { deductionPercent: 20, maxAttempts: 5 },
      },
    ],
    gym: { _id: GYM, name: "North Wall", status: "ACTIVE", adminIds: [] },
    users: [alex, kim, sam, lee, max, pat, una, ola],
    divisions: [
      { _id: OPEN, competitionId: COMPETITION, name: "Open" },
      { _id: YOUTH, competitionId: COMPETITION, name: "Youth" },
      { _id: OTHER_DIVISION, competitionId: OTHER_COMPETITION, name: "Open" },
    ],
    registrations: [
      registration(1, alex, OPEN),
      registration(2, kim, OPEN),
      registration(3, sam, OPEN),
      registration(4, lee, OPEN),
      registration(5, max, YOUTH),
      registration(6, pat, OPEN, "WAITLIST"),
      registration(7, ola, OPEN, "PENDING"),
      {
        _id: "6650000000000000000000f8",
        competitionId: OTHER_COMPETITION,
        climberId: una._id,
        divisionId: OTHER_DIVISION,
        status: "CONFIRMED",
      },
    ],
    routes: [
      { _id: ROUTE_100, competitionId: COMPETITION, routeNumber: "1", name: "Crimp Ladder", grade: "V2", pointValue: 100, official: true },
      { _id: ROUTE_200, competitionId: COMPETITION, routeNumber: "2", grade: "V3", pointValue: 200, official: true },
      { _id: ROUTE_300, competitionId: COMPETITION, routeNumber: "3", grade: "V5", pointValue: 300, official: true },
      { _id: OTHER_ROUTE, competitionId: OTHER_COMPETITION, routeNumber: "1", grade: "V4", pointValue: 500, official: true },
    ],
    results: [
      result(alex, ROUTE_300, 1, true),
      result(alex, ROUTE_200, 2, true),
      result(kim, ROUTE_300, 2, true),
      result(kim, ROUTE_100, 5, true),
      result(sam, ROUTE_200, 1, true),
      result(sam, ROUTE_100, 3, true),
      result(max, ROUTE_100, 1, true),
      result(una, OTHER_ROUTE, 1, true, OTHER_COMPETITION),
    ],
  };
}

/**
 * Points the models the leaderboard, scorecard and Route Assistant services read at data, read on
 * every call, so a test can change it between requests. Call it in beforeEach; vi.restoreAllMocks
 * undoes it.
 *
 * @param {object} data From standingsData.
 */
export function installStandingsDatabase(data) {
  const competitionOf = (id) => data.competitions.find((row) => same(row._id, id)) ?? null;
  vi.spyOn(Competition, "findById").mockImplementation((id) =>
    query([competitionOf(id)].filter(Boolean), { single: true }),
  );
  vi.spyOn(Gym, "findById").mockImplementation((id) =>
    query(same(id, data.gym._id) ? [data.gym] : [], { single: true }),
  );
  vi.spyOn(Gym, "exists").mockImplementation(async ({ _id, adminIds, status }) =>
    same(_id, data.gym._id) &&
    data.gym.adminIds.some((admin) => same(admin, adminIds)) &&
    data.gym.status === status
      ? { _id: data.gym._id }
      : null,
  );
  vi.spyOn(User, "exists").mockImplementation(async ({ _id }) =>
    data.gym.adminIds.some((admin) => same(admin, _id)) ? { _id } : null,
  );
  vi.spyOn(Division, "find").mockImplementation((filter) =>
    query(data.divisions.filter((row) => matches(row, filter))),
  );
  vi.spyOn(Division, "exists").mockImplementation(async (filter) => {
    const row = data.divisions.find((division) => matches(division, filter));
    return row ? { _id: row._id } : null;
  });
  const linked = () => ({ climberId: data.users, divisionId: data.divisions });
  vi.spyOn(Registration, "find").mockImplementation((filter) =>
    query(data.registrations.filter((row) => matches(row, filter)), { linked: linked() }),
  );
  vi.spyOn(Registration, "findOne").mockImplementation((filter) =>
    query(data.registrations.filter((row) => matches(row, filter)), { single: true, linked: linked() }),
  );
  vi.spyOn(Registration, "exists").mockImplementation(async (filter) => {
    const row = data.registrations.find((registration) => matches(registration, filter));
    return row ? { _id: row._id } : null;
  });
  vi.spyOn(Route, "find").mockImplementation((filter) =>
    query(data.routes.filter((row) => matches(row, filter))),
  );
  vi.spyOn(OfficialResult, "find").mockImplementation((filter) =>
    query(data.results.filter((row) => matches(row, filter))),
  );
  vi.spyOn(OfficialResult, "findOne").mockImplementation((filter) =>
    query(data.results.filter((row) => matches(row, filter)), { single: true }),
  );
}
