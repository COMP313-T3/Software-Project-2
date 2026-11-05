// Unit tests for the US-020 ranking logic. They need no database or server.
// Run from the server folder with:  node --test "test/**/*.test.js"

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareStandings,
  divisionStandings,
  rankEntries,
  totalsByClimber,
} from "../src/utils/leaderboardRanking.js";

const RULES = { deductionPercent: 20, maxAttempts: 5 };
const entry = (name, totals) => ({
  entryId: name,
  firstName: name,
  lastName: "Test",
  totalScore: 0,
  sends: 0,
  flashes: 0,
  attemptsToTops: 0,
  ...totals,
});
const summary = (ranked) => ranked.map((e) => `${e.firstName}:${e.rank}`).join(",");

describe("rankEntries", () => {
  it("orders by total score, highest first", () => {
    const ranked = rankEntries([
      entry("Low", { totalScore: 100 }),
      entry("High", { totalScore: 900 }),
      entry("Mid", { totalScore: 500 }),
    ]);
    assert.equal(summary(ranked), "High:1,Mid:2,Low:3");
  });

  it("breaks a tie on score with more sends, then more flashes, then fewer attempts", () => {
    assert.equal(
      rankEntries([entry("A", { totalScore: 500, sends: 1 }), entry("B", { totalScore: 500, sends: 2 })])[0].firstName,
      "B",
    );
    assert.equal(
      rankEntries([
        entry("A", { totalScore: 500, sends: 2 }),
        entry("B", { totalScore: 500, sends: 2, flashes: 1 }),
      ])[0].firstName,
      "B",
    );
    assert.equal(
      rankEntries([
        entry("A", { totalScore: 500, sends: 2, flashes: 1, attemptsToTops: 6 }),
        entry("B", { totalScore: 500, sends: 2, flashes: 1, attemptsToTops: 4 }),
      ])[0].firstName,
      "B",
    );
  });

  it("gives a full tie one shared rank and skips the next (1, 2, 2, 4), listed by name", () => {
    const ranked = rankEntries([
      entry("Zed", { totalScore: 800 }),
      entry("Amy", { totalScore: 800 }),
      entry("Top", { totalScore: 900 }),
      entry("Last", { totalScore: 100 }),
    ]);
    assert.equal(summary(ranked), "Top:1,Amy:2,Zed:2,Last:4");
    assert.deepEqual(ranked.map((e) => e.tied), [false, true, true, false]);
  });

  it("compareStandings is 0 only when every tiebreaker is equal", () => {
    assert.equal(compareStandings(entry("a", { totalScore: 1 }), entry("b", { totalScore: 1 })), 0);
    assert.ok(compareStandings(entry("a", { totalScore: 2 }), entry("b", { totalScore: 1 })) < 0);
  });
});

describe("totalsByClimber", () => {
  const routes = [
    { _id: "r1", pointValue: 1000, official: true },
    { _id: "r2", pointValue: 500, official: true },
    { _id: "rx", pointValue: 9999, official: false },
  ];
  const results = [
    { climberId: "c1", routeId: "r1", attempts: 1, sends: 1 },
    { climberId: "c1", routeId: "r2", attempts: 3, sends: 1 },
    { climberId: "c2", routeId: "rx", attempts: 1, sends: 1 },
    { climberId: "c3", routeId: "r1", attempts: 6, sends: 1 },
  ];

  it("scores with the competition's rules: a flash keeps full points, 20% off per failed attempt", () => {
    const c1 = totalsByClimber(results, routes, RULES).get("c1");
    assert.deepEqual(
      { totalScore: c1.totalScore, sends: c1.sends, flashes: c1.flashes, attemptsToTops: c1.attemptsToTops },
      { totalScore: 1300, sends: 2, flashes: 1, attemptsToTops: 4 },
    );
  });

  it("uses whatever rules are selected", () => {
    assert.equal(totalsByClimber(results, routes, { deductionPercent: 10, maxAttempts: 5 }).get("c1").totalScore, 1400);
  });

  it("ignores results on problems that aren't official problems of the competition", () => {
    assert.equal(totalsByClimber(results, routes, RULES).has("c2"), false);
  });

  it("scores a top after the maximum attempts as 0, not as a send", () => {
    const c3 = totalsByClimber(results, routes, RULES).get("c3");
    assert.equal(c3.totalScore, 0);
    assert.equal(c3.sends, 0);
  });
});

describe("divisionStandings", () => {
  it("ranks each division separately and lists confirmed Climbers without results at 0", () => {
    const divisions = divisionStandings({
      registrations: [
        { _id: "g1", climberId: { _id: "c1", firstName: "Ann", lastName: "A" }, divisionId: "open" },
        { _id: "g2", climberId: { _id: "c2", firstName: "Bob", lastName: "B" }, divisionId: "open" },
        { _id: "g3", climberId: { _id: "c3", firstName: "Cat", lastName: "C" }, divisionId: "beginner" },
      ],
      divisions: [{ _id: "open", name: "Open" }, { _id: "beginner", name: "Beginner" }],
      routes: [{ _id: "r1", pointValue: 1000, official: true }],
      results: [
        { climberId: "c2", routeId: "r1", attempts: 1, sends: 1 },
        { climberId: "c3", routeId: "r1", attempts: 1, sends: 1 },
      ],
      scoring: RULES,
    });
    assert.deepEqual(divisions.map((d) => d.name), ["Beginner", "Open"]);
    assert.deepEqual(
      divisions[1].standings.map((s) => [s.firstName, s.rank, s.totalScore]),
      [["Bob", 1, 1000], ["Ann", 2, 0]],
    );
    assert.equal(divisions[0].standings.length, 1);
  });
});
