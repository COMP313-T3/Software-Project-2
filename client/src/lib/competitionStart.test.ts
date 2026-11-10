import { describe, expect, it } from "vitest";
import { ApiError } from "./apiClient.ts";
import {
  awaitingStart,
  notStartedProblem,
  readCompetitionStart,
  startsAtFrom,
  timeLeft,
  timeLeftText,
} from "./competitionStart.ts";

const STARTS_AT = "2026-11-14T15:00:00.000Z";

describe("reading a competition's start from the API", () => {
  it("keeps the start time, the moment, and whether the server says it has started", () => {
    expect(readCompetitionStart({ startTime: "10:00", startsAt: STARTS_AT, started: false })).toEqual({
      startTime: "10:00",
      startsAt: STARTS_AT,
      started: false,
    });
    expect(readCompetitionStart({ startTime: null, startsAt: STARTS_AT, started: true })).toEqual({
      startTime: null,
      startsAt: STARTS_AT,
      started: true,
    });
  });

  it.each([undefined, null, "", {}, { started: false }, { startsAt: "soon", started: false }])(
    "counts an answer without a usable start (%j) as started, so nothing is locked on a guess",
    (value) => {
      expect(readCompetitionStart(value)).toEqual({ startTime: null, startsAt: null, started: true });
    },
  );

  it.each(["24:00", "9:30", "10am", 1000])("leaves out a start time that isn't HH:mm (%j)", (startTime) => {
    expect(readCompetitionStart({ startTime, startsAt: STARTS_AT, started: false }).startTime).toBeNull();
  });
});

describe("whether a Climber is still waiting for the start", () => {
  it("waits for a published competition the server says hasn't started", () => {
    expect(awaitingStart({ status: "PUBLISHED", startsAt: STARTS_AT, started: false })).toBe(true);
    expect(awaitingStart({ startsAt: STARTS_AT, started: false })).toBe(true);
  });

  it.each([
    ["one that has started", { status: "PUBLISHED", startsAt: STARTS_AT, started: true }],
    ["a cancelled one, which has no start to wait for", { status: "CANCELLED", startsAt: STARTS_AT, started: false }],
    ["a draft", { status: "DRAFT", startsAt: STARTS_AT, started: false }],
    ["one whose start the API didn't send", { status: "PUBLISHED", startsAt: null, started: false }],
  ])("doesn't wait for %s", (_case, competition) => {
    expect(awaitingStart(competition)).toBe(false);
  });
});

describe("the refusal of something that opens at the start", () => {
  it("reads the start from an HTTP refusal", () => {
    const refusal = new ApiError(409, "COMPETITION_NOT_STARTED", "Not yet.", undefined, { startsAt: STARTS_AT });
    expect(startsAtFrom(refusal)).toBe(STARTS_AT);
  });

  it.each([
    ["another error", new ApiError(404, "REGISTRATION_NOT_FOUND", "Not registered.")],
    ["a refusal without the start", new ApiError(409, "COMPETITION_NOT_STARTED", "Not yet.")],
    [
      "a refusal with a start that isn't a time",
      new ApiError(409, "COMPETITION_NOT_STARTED", "Not yet.", undefined, { startsAt: "soon" }),
    ],
    ["something that isn't an API error", new Error("offline")],
    ["nothing", null],
  ])("finds no start in %s", (_case, error) => {
    expect(startsAtFrom(error)).toBeNull();
  });

  it("turns a live connection's refusal into the same error, keeping the start", () => {
    const problem = notStartedProblem({
      error: "COMPETITION_NOT_STARTED",
      message: "This competition starts on November 14, 2026 at 10:00 a.m.",
      details: { startsAt: STARTS_AT },
    });
    expect(problem).toBeInstanceOf(ApiError);
    expect(problem).toMatchObject({ status: 409, code: "COMPETITION_NOT_STARTED" });
    expect(problem?.message).toBe("This competition starts on November 14, 2026 at 10:00 a.m.");
    expect(startsAtFrom(problem)).toBe(STARTS_AT);
  });

  it.each([null, undefined, "closed", { error: "REGISTRATION_NOT_FOUND" }, {}])(
    "leaves any other live refusal (%j) to the caller",
    (value) => {
      expect(notStartedProblem(value)).toBeNull();
    },
  );
});

describe("the time left until the start", () => {
  const at = (iso: string) => Date.parse(iso);

  it("counts whole days, hours, minutes and seconds", () => {
    expect(timeLeft(STARTS_AT, at("2026-11-12T11:54:55.000Z"))).toEqual({
      days: 2,
      hours: 3,
      minutes: 5,
      seconds: 5,
      total: 183905,
    });
  });

  it("shows the last second as 1 and the start itself, or later, as 0", () => {
    expect(timeLeft(STARTS_AT, at("2026-11-14T14:59:59.001Z")).total).toBe(1);
    expect(timeLeft(STARTS_AT, at("2026-11-14T15:00:00.000Z")).total).toBe(0);
    expect(timeLeft(STARTS_AT, at("2026-11-15T15:00:00.000Z"))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      total: 0,
    });
  });

  it.each([
    [183905, "2 days, 3 hours and 5 minutes"],
    [86400, "1 day"],
    [90060, "1 day, 1 hour and 1 minute"],
    [3600, "1 hour"],
    [3660, "1 hour and 1 minute"],
    [125, "2 minutes"],
    [60, "1 minute"],
    [59, "59 seconds"],
    [1, "1 second"],
    [0, "no time"],
  ])("says %i seconds as %j, with the seconds only in the last minute", (total, text) => {
    const left = timeLeft(new Date(total * 1000).toISOString(), 0);
    expect(left.total).toBe(total);
    expect(timeLeftText(left)).toBe(text);
  });
});
