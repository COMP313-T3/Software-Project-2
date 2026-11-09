import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { checkedLeaderboard, getLeaderboard, leaderboardName, leaderboardProblem, type Leaderboard, type RegistrationStatus } from "./leaderboardApi.ts";
import { boardFixture, BOARD_COMPETITION as id } from "../test/leaderboardFixtures.ts";
vi.mock("./apiClient.ts", async original => ({ ...await original<typeof import("./apiClient.ts")>(), apiRequest: vi.fn() }));
vi.mock("./sessionClient.ts", () => ({ withAccessToken: (send: (token: string) => unknown) => send("test-token") }));
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });
describe("US-020 leaderboard contract and private/public API adapters", () => {
  it.each(["manage", "climber", "public"] as const)("reads the correct %s endpoint and audience", async audience => {
    const value = boardFixture(audience), signal = new AbortController().signal; vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(getLeaderboard(id, audience, signal)).resolves.toEqual(value);
    const path = audience === "manage" ? `/api/gym-admin/competitions/${id}/leaderboard` : audience === "climber" ? `/api/competitions/${id}/leaderboard` : `/api/leaderboards/${id}`;
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(path, audience === "public" ? { signal } : { signal, headers: { Authorization: "Bearer test-token" } });
  });
  it("encodes the selected competition id", async () => {
    const value = boardFixture(); value.competition._id = "comp/id"; vi.mocked(apiRequest).mockResolvedValue(value); await getLeaderboard("comp/id", "manage");
    expect(apiRequest).toHaveBeenCalledWith("/api/gym-admin/competitions/comp%2Fid/leaderboard", expect.anything());
  });
  it.each([
    (b: ReturnType<typeof boardFixture>) => { b.competition._id = "foreign"; },
    (b: ReturnType<typeof boardFixture>) => { b.audience = "public"; },
    (b: ReturnType<typeof boardFixture>) => { b.generatedAt = "not a date"; },
    (b: ReturnType<typeof boardFixture>) => { b.divisions[0].standings[0].rank = 0; },
    (b: ReturnType<typeof boardFixture>) => { b.divisions[0].standings[0].totalScore = -1; },
    (b: ReturnType<typeof boardFixture>) => { b.divisions[0].standings[0].totalScore = 1.5; },
    (b: ReturnType<typeof boardFixture>) => { b.divisions[0].standings[0].climber._id = undefined; },
    (b: ReturnType<typeof boardFixture>) => { b.divisions[0].climberCount = 20; },
    (b: ReturnType<typeof boardFixture>) => { b.divisions.push(b.divisions[0]); },
    (b: ReturnType<typeof boardFixture>) => { b.divisions[0].standings[1].entryId = b.divisions[0].standings[0].entryId; },
  ])("rejects incomplete, duplicate or wrong-competition data %#", alter => {
    const value = boardFixture(); alter(value); expect(() => checkedLeaderboard(value, id, "manage")).toThrow();
  });
  it("rejects private Climber IDs/public settings in a public snapshot", () => {
    const value = boardFixture("public"); value.divisions[0].standings[0].climber._id = "private";
    expect(() => checkedLeaderboard(value, id, "public")).toThrow();
    delete value.divisions[0].standings[0].climber._id; value.competition.publicLeaderboard = true;
    expect(() => checkedLeaderboard(value, id, "public")).toThrow();
  });
  it("preserves server ordering, shared ranks and zero scores without calculating rankings", () => {
    const value = boardFixture(); value.divisions[0].standings[0].totalScore = 0; value.scoring = null;
    expect(checkedLeaderboard(value, id, "manage")).toBe(value); expect(value.divisions[0].standings.map(e => e.rank)).toEqual([1, 2, 2]);
  });
  it.each([401, 403, 404, 429, 500])("preserves the API error without changing permissions (%s)", async status => {
    const error = new ApiError(status, "REJECTED", "Unavailable"); vi.mocked(apiRequest).mockRejectedValue(error);
    await expect(getLeaderboard(id, "manage")).rejects.toBe(error); expect(apiRequest).toHaveBeenCalledOnce();
  });
  it("uses safe error/name fallbacks", () => {
    const e = boardFixture().divisions[0].standings[0]; e.climber.firstName = e.climber.lastName = null;
    expect(leaderboardName(e)).toBe("Climber"); expect(leaderboardProblem(new Error("private database"))).not.toContain("private");
    expect(leaderboardProblem(new ApiError(503, "INTERNAL_ERROR", "private database"))).not.toContain("private");
  });
});

describe("US-032 the Climber's place in the standings", () => {
  it("accepts the Climber's place, the gaps to the places above, and their registration", () => {
    const value = boardFixture("climber");

    expect(checkedLeaderboard(value, id, "climber")).toBe(value);
  });

  it("accepts a Climber who isn't ranked, or who is viewing a public leaderboard without registering", () => {
    const waiting = boardFixture("climber");
    waiting.myEntry = null;
    waiting.myRegistration = { status: "WAITLIST", division: null };
    const visitor = boardFixture("climber");
    visitor.myEntry = null;
    visitor.myRegistration = null;

    expect(checkedLeaderboard(waiting, id, "climber")).toBe(waiting);
    expect(checkedLeaderboard(visitor, id, "climber")).toBe(visitor);
  });

  const PLACE = "The Climber's position was incomplete.";
  const REGISTRATION = "The Climber's registration was incomplete.";
  it.each([
    ["a missing gap to the leader", PLACE, (b: Leaderboard) => { b.myEntry = { ...b.myEntry!, pointsBehindLeader: undefined as unknown as number }; }],
    ["a place above that isn't above", PLACE, (b: Leaderboard) => { b.myEntry = { ...b.myEntry!, placeAbove: { rank: 2, pointsBehind: 10 } }; }],
    ["no points between the two places", PLACE, (b: Leaderboard) => { b.myEntry = { ...b.myEntry!, placeAbove: { rank: 1, pointsBehind: 0 } }; }],
    ["a negative count", PLACE, (b: Leaderboard) => { b.myEntry = { ...b.myEntry!, flashes: -1 }; }],
    ["an unknown registration status", REGISTRATION, (b: Leaderboard) => { b.myRegistration = { status: "WITHDRAWN" as RegistrationStatus, division: null }; }],
    ["a missing registration", REGISTRATION, (b: Leaderboard) => { b.myRegistration = undefined; }],
  ])("rejects %s", (_label, message, alter) => {
    const value = boardFixture("climber");
    alter(value);

    expect(() => checkedLeaderboard(value, id, "climber")).toThrow(message);
  });

  it("rejects a Climber's registration in another audience's view", () => {
    const value = boardFixture("public");
    value.myRegistration = null;

    expect(() => checkedLeaderboard(value, id, "public")).toThrow("The leaderboard audience did not match this page.");
  });
});
