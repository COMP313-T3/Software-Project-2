import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient.ts";
import { changedRouteIds, checkedScorecard, getScorecard, sameScorecard, scorecardProblem, type Scorecard } from "./scorecardApi.ts";
import { SCORECARD_COMPETITION as id, scorecardFixture, sentProblemThree } from "../test/scorecardFixtures.ts";

vi.mock("./apiClient.ts", async (original) => ({
  ...(await original<typeof import("./apiClient.ts")>()),
  apiRequest: vi.fn(),
}));
vi.mock("./sessionClient.ts", () => ({
  withAccessToken: (send: (token: string) => unknown) => send("test-token"),
}));

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
});

describe("US-031 scorecard API client", () => {
  it("reads the logged-in Climber's own scorecard with their access token", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue(scorecardFixture());

    await expect(getScorecard(id, signal)).resolves.toEqual(scorecardFixture());
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(`/api/competitions/${id}/scorecard`, {
      signal,
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("encodes the competition ID in the address", async () => {
    const card = scorecardFixture();
    card.competition._id = "comp/id";
    vi.mocked(apiRequest).mockResolvedValue(card);

    await getScorecard("comp/id");

    expect(apiRequest).toHaveBeenCalledWith("/api/competitions/comp%2Fid/scorecard", expect.anything());
  });

  it("passes on the API's refusal, such as a Climber who isn't registered", async () => {
    const refusal = new ApiError(404, "REGISTRATION_NOT_FOUND", "You're not registered for this competition.");
    vi.mocked(apiRequest).mockRejectedValue(refusal);

    await expect(getScorecard(id)).rejects.toBe(refusal);
  });
});

describe("checking a scorecard before it is shown", () => {
  it("accepts a complete scorecard for the competition on the page", () => {
    expect(checkedScorecard(scorecardFixture(), id)).toEqual(scorecardFixture());
  });

  it("accepts a cancelled competition, a waitlisted place, and missing scoring, gym and division", () => {
    const card = scorecardFixture();
    card.competition.status = "CANCELLED";
    card.competition.gym = null;
    card.registration = { ...card.registration, status: "WAITLIST", statusLabel: "On the waitlist", confirmed: false, division: null };
    card.scoring = null;

    expect(() => checkedScorecard(card, id)).not.toThrow();
  });

  it.each<[string, (card: Scorecard) => void]>([
    ["another competition", (card) => { card.competition._id = "507f1f77bcf86cd799439099"; }],
    ["a draft competition", (card) => { (card.competition as { status: string }).status = "DRAFT"; }],
    ["a date that isn't a calendar day", (card) => { card.competition.date = "2026-11-21T00:00:00Z"; }],
    ["a registration that disagrees with itself", (card) => { card.registration.confirmed = false; }],
    ["a repeated problem", (card) => { card.routes[1].routeId = card.routes[0].routeId; }],
    ["a problem marked completed while unfinished", (card) => { card.routes[2].completed = true; }],
    ["an attempted problem without a result", (card) => { card.routes[2].result = null; }],
    ["a negative score", (card) => { card.routes[0].result!.officialScore = -5; }],
    ["a send that disagrees with sent", (card) => { card.routes[1].result!.sent = false; }],
    ["an unknown status", (card) => { (card.routes[3] as { status: string }).status = "TOPPED"; }],
    ["totals that don't match the problems", (card) => { card.summary.routeCount = 4; }],
    ["a generated time that isn't a date", (card) => { card.generatedAt = "soon"; }],
  ])("rejects %s", (_name, alter) => {
    const card = scorecardFixture();
    alter(card);

    expect(() => checkedScorecard(card, id)).toThrow();
  });

  it("rejects something that isn't a scorecard at all", () => {
    expect(() => checkedScorecard(null, id)).toThrow();
    expect(() => checkedScorecard({ routes: [] }, id)).toThrow();
  });
});

describe("comparing scorecards", () => {
  it("finds the problem a new official result changed", () => {
    expect(changedRouteIds(scorecardFixture(), sentProblemThree())).toEqual(["route-3"]);
  });

  it("finds nothing when only the generated time differs", () => {
    const later = scorecardFixture();
    later.generatedAt = "2026-11-09T07:00:00.000Z";

    expect(changedRouteIds(scorecardFixture(), later)).toEqual([]);
    expect(sameScorecard(scorecardFixture(), later)).toBe(true);
    expect(sameScorecard(scorecardFixture(), sentProblemThree())).toBe(false);
  });

  it("counts a problem added to the competition as changed", () => {
    const next = scorecardFixture();
    next.routes.push({ ...next.routes[3], routeId: "route-14", routeNumber: "14" });

    expect(changedRouteIds(scorecardFixture(), next)).toEqual(["route-14"]);
  });

  it("counts a removed result as changed", () => {
    const next = scorecardFixture();
    next.routes[2] = { ...next.routes[2], status: "NOT_ATTEMPTED", statusLabel: "Not attempted yet", result: null };

    expect(changedRouteIds(scorecardFixture(), next)).toEqual(["route-3"]);
  });
});

describe("messages for a scorecard that can't be loaded", () => {
  it("asks the Climber to sign in again when the login ended", () => {
    expect(scorecardProblem(new ApiError(401, "SESSION_EXPIRED", "Session expired."))).toBe(
      "Your session has expired. Sign in again to view your scorecard.",
    );
  });

  it("shows the API's own message for other refusals", () => {
    const message = "You're not registered for this competition, so you don't have a scorecard for it.";
    expect(scorecardProblem(new ApiError(404, "REGISTRATION_NOT_FOUND", message))).toBe(message);
  });

  it("keeps server and network details out of the message", () => {
    const fallback = "Couldn't load your scorecard. Please try again.";
    expect(scorecardProblem(new ApiError(500, "INTERNAL_ERROR", "stack trace"))).toBe(fallback);
    expect(scorecardProblem(new ApiError(0, "NETWORK_ERROR", "fetch failed"))).toBe(fallback);
    expect(scorecardProblem(new Error("The scorecard response was incomplete."))).toBe(fallback);
  });
});
